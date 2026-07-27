const { chromium } = require('playwright');

const RESULT_GRID_SELECTOR = '#M_Table, #F_Table';
const NAV_TIMEOUT = 60000;
const SELECTOR_TIMEOUT = 35000;
const MAX_ATTEMPTS = 3;

// Canary threshold: if more than half of parsed rows can't have a grade
// extracted, the page almost certainly changed its grade convention (the
// `y9`/`y10` row class, or the `FR`/`SO`/`JR`/`SR` text fallback) rather than
// this team simply having a lot of ungraded entries. Fail loudly instead of
// silently importing rows with blank grades that would look like real data.
const MAX_MISSING_GRADE_RATIO = 0.5;

// Headless Chromium's default User-Agent contains the literal string
// "HeadlessChrome", which athletic.net (and most sites behind a bot filter)
// treat as a scraper — they serve a challenge/empty shell instead of the
// results page, so the server-rendered #M_Table / #F_Table never render and
// waitForSelector times out. Presenting a normal desktop-Chrome identity
// (UA + viewport + locale + Accept-Language) is the difference between getting
// the real results grid and getting silently blocked from a datacenter IP.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// All diagnostics go to stderr on purpose: the parent process (routes/teams.js)
// reads stdout as the CSV payload and stderr as the log stream, so anything
// printed here must never touch stdout.
async function captureFailureDiagnostics(page, attempt) {
  try {
    const finalUrl = page.url();
    const title = await page.title().catch(() => '(could not read title)');
    let bodySnippet = '(could not read body)';
    try {
      bodySnippet = (await page.content()).replace(/\s+/g, ' ').trim().slice(0, 1500);
    } catch (_) {
      /* page may have been closed / navigated */
    }
    console.error(`--- scrape failure diagnostics (attempt ${attempt}) ---`);
    console.error('final URL :', finalUrl);
    console.error('page title:', title);
    console.error('body[0..1500]:', bodySnippet);
    console.error('-------------------------------------------------');
  } catch (e) {
    console.error('Could not capture failure diagnostics:', e.message);
  }
}

async function scrapeSeasonResults(teamId, year) {
  console.error(`Starting Playwright scrape for team ${teamId}, year ${year}`);

  let browser;
  try {
    // Launch browser. --disable-blink-features=AutomationControlled removes the
    // navigator.webdriver=true signal that flags automated browsers.
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const page = await context.newPage();

    // Navigate to Athletic.net season results page
    const url = `https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID=${teamId}&S=${year}`;

    // Retry the navigate + wait-for-grid + extract step as one unit: transient
    // bot challenges, cold datacenter connections, slow/partial renders, and
    // (via the canary checks inside extractResults) apparent page-structure
    // breaks are all common and usually clear on a second attempt — and if
    // the structure really has changed, retrying can't make it worse.
    let lastError;
    let loaded = false;
    let extraction;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.error(`Navigating (attempt ${attempt}/${MAX_ATTEMPTS}): ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

        console.error('Waiting for results grid...');
        await page.waitForSelector(RESULT_GRID_SELECTOR, { timeout: SELECTOR_TIMEOUT });
        console.error('Page loaded successfully and main table found.');

        extraction = await extractResults(page, year);

        // Canary: meets are listed but zero results were parsed out of the
        // gender tables. A season can legitimately have zero meets (early
        // preseason), but it can't have meets with zero results in the grid
        // that's supposed to hold them — that combination means the parser's
        // assumptions about the table shape no longer match the page.
        if (extraction.meetCount > 0 && extraction.results.length === 0) {
          throw new Error(
            `Structure check failed: found ${extraction.meetCount} meets listed but 0 results ` +
              `parsed from the gender tables — the results-grid markup likely changed shape.`
          );
        }

        // Canary: most parsed rows have no grade. Real rosters have a few
        // ungraded entries at most; a majority blank means the grade
        // convention (row class or FR/SO/JR/SR text) broke, not that this
        // team happens to be mostly ungraded.
        if (extraction.results.length > 0) {
          const missingRatio = extraction.missingGradeCount / extraction.results.length;
          if (missingRatio > MAX_MISSING_GRADE_RATIO) {
            throw new Error(
              `Structure check failed: ${extraction.missingGradeCount}/${extraction.results.length} ` +
                `parsed results have no grade — the grade-parsing convention likely changed.`
            );
          }
        }

        if (extraction.meetCount === 0) {
          console.error('No meets listed for this season yet (0 meets in #MeetList) — treating as a valid empty season, not a failure.');
        }

        loaded = true;
        break;
      } catch (err) {
        lastError = err;
        console.error(`Attempt ${attempt} failed: ${err.message}`);
        await captureFailureDiagnostics(page, attempt);
        if (attempt < MAX_ATTEMPTS) {
          const backoff = 2000 * attempt;
          console.error(`Retrying in ${backoff}ms...`);
          await page.waitForTimeout(backoff);
        }
      }
    }

    if (!loaded) {
      throw new Error(
        `Results grid (${RESULT_GRID_SELECTOR}) never appeared, or its contents failed a structure ` +
          `check, after ${MAX_ATTEMPTS} attempts — athletic.net likely served a bot-challenge, an ` +
          `empty page, or changed its page structure (see the diagnostics logged above). ` +
          `Last error: ${lastError && lastError.message}`
      );
    }

    const allResults = extraction.results;
    console.error(`Finished scraping. Found ${allResults.length} results.`);

    // Output CSV format. Source URL / Athletic Meet ID are new columns (Phase
    // 2): they let the ingestion route persist a link to this race's full
    // results page, which the meet-field scraper navigates to directly.
    console.log('Race Name,Athlete Name,Grade,Gender,Time,Race Date,Distance,Source URL,Athletic Meet ID');
    allResults.forEach(row => {
      console.log(row.map(field => `"${field}"`).join(','));
    });

    await browser.close();
    return allResults;

  } catch (error) {
    console.error('Scraping error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

// Runs in-page: extracts race results plus canary metadata (meet count,
// rows missing a parseable grade) used by the caller's structure checks.
async function extractResults(page, year) {
  return page.evaluate((year) => {
      const results = [];
      let missingGradeCount = 0;

      // Build distance key
      const distanceKey = {};
      const distanceTable = document.querySelector('table.pull-right-sm');
      if (distanceTable) {
        const rows = distanceTable.querySelectorAll('tr');
        rows.forEach(row => {
          const cell = row.querySelector('td');
          if (cell) {
            const sub = cell.querySelector('sub');
            if (sub) {
              const key = sub.textContent.trim();
              sub.remove();
              const distance = cell.textContent.trim();
              distanceKey[key] = distance;
            }
          }
        });
      }

      // Build meet key
      const meetKey = {};
      const meetListTable = document.querySelector('#MeetList');
      const resultHeadersTable = document.querySelector('#M_Table table.DataTable, #F_Table table.DataTable');

      if (meetListTable && resultHeadersTable) {
        const meets = meetListTable.querySelectorAll('tbody tr');
        let meetIdx = 0;

        meets.forEach(meetTr => {
          // Skip header rows
          if (meetTr.querySelector('th')) return;

          const cells = meetTr.querySelectorAll('td');
          if (cells.length === 2) {
            const dateLabel = cells[0].querySelector('label');
            const nameA = cells[1].querySelector('a');

            if (dateLabel && nameA) {
              const meetDate = dateLabel.textContent.trim();
              const meetName = nameA.textContent.trim();
              // The season grid only ever shows our own team's rows, but each
              // meet link points at that meet's own results page — which is
              // where the full field (every school, every athlete) lives.
              // Capturing it here is what makes Phase 2's meet scraper
              // possible without guessing or constructing meet URLs.
              const sourceUrl = nameA.href || null; // browser-resolved absolute URL
              const rawHref = nameA.getAttribute('href') || null;
              const meetIdMatch = (sourceUrl || rawHref || '').match(/\/meet\/(\d+)/);
              const athleticMeetId = meetIdMatch ? meetIdMatch[1] : null;

              meetKey[meetIdx] = {
                name: meetName,
                date: meetDate,
                sourceUrl,
                athleticMeetId,
              };
              meetIdx++;
            }
          }
        });
      }

      console.log(`Found ${Object.keys(meetKey).length} meets and ${Object.keys(distanceKey).length} distance types.`);

      // Parse gender tables
      function parseGenderTable(tableId, gender) {
        const tableResults = [];
        const table = document.querySelector(`#${tableId}`);
        if (!table) {
          console.log(`${gender}'s table (${tableId}) not found.`);
          return tableResults;
        }

        console.log(`Parsing ${gender}'s table...`);
        const athleteRows = table.querySelectorAll('tr');

        athleteRows.forEach(row => {
          // Skip header rows
          if (row.querySelector('th')) return;

          const cells = row.querySelectorAll('td');
          if (cells.length < 2) return;

          // Get grade
          let grade = '';
          const rowClasses = row.className.split(' ');
          for (const cls of rowClasses) {
            if (cls && cls.startsWith('y') && /^\d+$/.test(cls.substring(1))) {
              grade = cls.substring(1);
              break;
            }
          }

          if (!grade && cells[0]) {
            const gradeCell = cells[0].textContent.trim();
            if (/^\d+$/.test(gradeCell) && parseInt(gradeCell) >= 1 && parseInt(gradeCell) <= 12) {
              grade = gradeCell;
            } else if (/^(FR|SO|JR|SR)/i.test(gradeCell)) {
              const gradeMap = {'FR': '9', 'SO': '10', 'JR': '11', 'SR': '12'};
              grade = gradeMap[gradeCell.toUpperCase().substring(0, 2)] || '12';
            }
          }

          const athleteNameTag = cells[1].querySelector('a');
          if (!athleteNameTag) return;
          const athleteName = athleteNameTag.textContent.trim();

          // Result cells start from the 3rd column (index 2)
          for (let i = 2; i < cells.length; i++) {
            const cell = cells[i];
            const timeA = cell.querySelector('a');
            if (timeA) {
              const timeStr = timeA.textContent.trim();
              const distanceIdSpan = cell.querySelector('span.subscript');
              const distId = distanceIdSpan ? distanceIdSpan.textContent.trim() : 'N/A';

              const distance = distanceKey[distId] || 'Unknown';
              const meetInfo = meetKey[i - 2] || {};
              const raceName = meetInfo.name || 'Unknown Meet';
              const raceDate = meetInfo.date || 'Unknown Date';
              const sourceUrl = meetInfo.sourceUrl || '';
              const athleticMeetId = meetInfo.athleticMeetId || '';

              if (!grade) missingGradeCount++;

              tableResults.push([
                raceName,
                athleteName,
                grade,
                gender,
                timeStr,
                `${raceDate}, ${year}`,
                distance,
                sourceUrl,
                athleticMeetId
              ]);
            }
          }
        });

        console.log(`Found ${tableResults.length} results in ${gender}'s table.`);
        return tableResults;
      }

      // Process both tables
      results.push(...parseGenderTable('M_Table', 'Men'));
      results.push(...parseGenderTable('F_Table', 'Women'));

      return {
        results,
        meetCount: Object.keys(meetKey).length,
        distanceCount: Object.keys(distanceKey).length,
        missingGradeCount,
      };
    }, year);
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  let teamId, year;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--team_id' && args[i + 1]) {
      teamId = args[i + 1];
    }
    if (args[i] === '--year' && args[i + 1]) {
      year = args[i + 1];
    }
  }

  if (!teamId || !year) {
    console.error('Usage: node scrape_season_playwright.js --team_id <id> --year <year>');
    process.exit(1);
  }

  scrapeSeasonResults(teamId, year)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { scrapeSeasonResults, extractResults, MAX_MISSING_GRADE_RATIO };
