const { chromium } = require('playwright');

// Unlike scrape_season_playwright.js (results), this doesn't scrape a
// separate roster URL — there isn't one on the modern site as far as we can
// tell. Instead it reuses the same CrossCountry/Results/Season.aspx page,
// clicks the "Roster" tab and the ShowAthletes/click_M/click_F reveal
// controls to expose everyone on the roster (including athletes with zero
// results yet, which is exactly the preseason case this exists for), then
// parses the same #M_Table/#F_Table markup the results scraper already
// parses successfully in production. This mirrors scrape_roster.py, a
// dead-but-deliberately-written script found in the pre-migration codebase —
// its selectors (#ShowAthletes, #click_M, #click_F, the "Roster" tab XPath)
// are the best evidence available of the page's real structure, since
// Cloudflare blocks probing it live from this dev environment.
//
// If the roster tab/toggles don't exist for a given team (e.g. Athletic.net
// changed the page since), this fails with diagnostics rather than silently
// reporting an empty roster — see the zero-athletes guard in routes/teams.js.

const NAV_TIMEOUT = 60000;
const SELECTOR_TIMEOUT = 35000;
const MAX_ATTEMPTS = 3;
const TABLE_SELECTOR = '#M_Table, #F_Table';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
    console.error(`--- roster scrape failure diagnostics (attempt ${attempt}) ---`);
    console.error('final URL :', finalUrl);
    console.error('page title:', title);
    console.error('body[0..1500]:', bodySnippet);
    console.error('-------------------------------------------------');
  } catch (e) {
    console.error('Could not capture failure diagnostics:', e.message);
  }
}

// Best-effort clicks: any of these controls may not exist (older/newer page
// variants, or a team with no Roster tab at all) — that's fine, we just move
// on rather than failing the whole scrape over an optional reveal control.
async function tryClick(page, selector, description) {
  try {
    const el = await page.waitForSelector(selector, { timeout: 5000 });
    await el.click();
    console.error(`Clicked ${description} (${selector}).`);
    await page.waitForTimeout(500);
  } catch (_) {
    console.error(`${description} (${selector}) not found — continuing without it.`);
  }
}

async function scrapeTeamRoster(teamId, year) {
  console.error(`Starting Playwright roster scrape for team ${teamId}, year ${year}`);

  let browser;
  try {
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
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });

    const page = await context.newPage();
    const url = `https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID=${teamId}&S=${year}`;

    let loaded = false;
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.error(`Navigating (attempt ${attempt}/${MAX_ATTEMPTS}): ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

        // Reveal the roster: switch to the Roster tab if present, then
        // expand "show all athletes" and both gender sections.
        await tryClick(page, 'a:has-text("Roster")', 'Roster tab');
        await tryClick(page, '#ShowAthletes', 'Show-all-athletes toggle');
        await tryClick(page, '#click_M', "Men's section toggle");
        await tryClick(page, '#click_F', "Women's section toggle");

        console.error('Waiting for roster/results grid...');
        await page.waitForSelector(TABLE_SELECTOR, { timeout: SELECTOR_TIMEOUT });
        console.error('Page loaded successfully and roster table found.');
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
        `Roster grid (${TABLE_SELECTOR}) never appeared after ${MAX_ATTEMPTS} attempts — ` +
          `athletic.net likely served a bot-challenge, or this team/season genuinely has no ` +
          `roster tab yet (see diagnostics above). Last error: ${lastError && lastError.message}`
      );
    }

    // Same row-parsing logic as scrape_season_playwright.js's result grid
    // (grade from the row's `yN` class or first-cell text, name from the
    // link in the second cell) but we only need name/grade/gender here —
    // there may be zero result cells for an athlete who hasn't raced yet,
    // and that's fine, they still belong on the roster.
    const athletes = await page.evaluate(() => {
      function parseGenderTable(tableId, gender) {
        const rows = [];
        const table = document.querySelector(`#${tableId}`);
        if (!table) return rows;

        const seen = new Set();
        table.querySelectorAll('tr').forEach((row) => {
          if (row.querySelector('th')) return;
          const cells = row.querySelectorAll('td');
          if (cells.length < 2) return;

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
            if (/^\d+$/.test(gradeCell) && parseInt(gradeCell, 10) >= 1 && parseInt(gradeCell, 10) <= 12) {
              grade = gradeCell;
            } else if (/^(FR|SO|JR|SR)/i.test(gradeCell)) {
              const gradeMap = { FR: '9', SO: '10', JR: '11', SR: '12' };
              grade = gradeMap[gradeCell.toUpperCase().substring(0, 2)] || '';
            }
          }

          const nameTag = cells[1].querySelector('a');
          if (!nameTag) return;
          const name = nameTag.textContent.trim();
          if (!name || seen.has(name)) return;
          seen.add(name);

          rows.push({ name, grade, gender });
        });
        return rows;
      }

      return [...parseGenderTable('M_Table', 'Men'), ...parseGenderTable('F_Table', 'Women')];
    });

    console.error(`Finished scraping. Found ${athletes.length} athletes on the roster.`);

    console.log('Athlete Name,Grade,Gender');
    athletes.forEach((a) => {
      console.log([a.name, a.grade, a.gender].map((f) => `"${(f || '').replace(/"/g, '""')}"`).join(','));
    });

    await browser.close();
    return athletes;
  } catch (error) {
    console.error('Roster scraping error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let teamId, year;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--team_id' && args[i + 1]) teamId = args[i + 1];
    if (args[i] === '--year' && args[i + 1]) year = args[i + 1];
  }
  if (!teamId || !year) {
    console.error('Usage: node scrape_roster_playwright.js --team_id <id> --year <year>');
    process.exit(1);
  }
  scrapeTeamRoster(teamId, year)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { scrapeTeamRoster };
