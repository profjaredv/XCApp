// Fixture-based regression test for the Athletic.net results-page parser,
// per the audit's Phase 4 recommendation: catch a page-structure change in
// CI via saved HTML, not by a coach noticing wrong data. Loads fixture HTML
// (test/fixtures/season-*.html) into a real Chromium page via Playwright —
// same DOM engine the live scraper runs against — and calls the exported
// extractResults() directly, bypassing the network/navigation retry loop
// entirely.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { extractResults, MAX_MISSING_GRADE_RATIO } = require('../scrape_season_playwright');

async function loadFixture(browser, filename) {
  const page = await browser.newPage();
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf8');
  await page.setContent(html);
  return page;
}

test('extractResults against fixture HTML', async (t) => {
  // Some environments pre-provision a Chromium build out-of-band and skip
  // Playwright's own browser download (see PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
  // in CI config); if the pinned playwright version's expected revision
  // isn't present, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH points at the one
  // that is. Unset anywhere else, so this is a no-op in normal CI/Railway.
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  t.after(() => browser.close());

  await t.test('valid season page: parses results, meets, distances, no missing grades', async () => {
    const page = await loadFixture(browser, 'season-valid.html');
    const extraction = await extractResults(page, 2025);
    await page.close();

    assert.equal(extraction.meetCount, 2);
    assert.equal(extraction.distanceCount, 2);
    assert.equal(extraction.missingGradeCount, 0);
    assert.equal(extraction.results.length, 4); // 3 in M_Table + 1 in F_Table

    const [raceName, athleteName, grade, gender, time, raceDate, distance, sourceUrl, athleticMeetId, athleticAthleteId] = extraction.results[0];
    assert.equal(raceName, 'Season Opener');
    assert.equal(athleteName, 'Alex Runner');
    assert.equal(grade, '9');
    assert.equal(gender, 'Men');
    assert.equal(time, '18:32');
    assert.equal(raceDate, 'Sep 6, 2025');
    assert.equal(distance, '5,000 Meters');
    assert.equal(sourceUrl, 'https://www.athletic.net/CrossCountry/meet/111222/results/all');
    assert.equal(athleticMeetId, '111222');
    assert.equal(athleticAthleteId, 'https://www.athletic.net/athlete/1');
  });

  await t.test('empty preseason page: zero meets, zero results — not a canary trip', async () => {
    const page = await loadFixture(browser, 'season-empty-preseason.html');
    const extraction = await extractResults(page, 2025);
    await page.close();

    assert.equal(extraction.meetCount, 0);
    assert.equal(extraction.results.length, 0);
    // Caller-side canary logic (in scrapeSeasonResults) only throws when
    // meetCount > 0 && results.length === 0 — this fixture must not satisfy
    // that condition, i.e. this state is legitimate, not a failure.
    assert.ok(!(extraction.meetCount > 0 && extraction.results.length === 0));
  });

  await t.test('broken-structure page: meets listed but 0 parsed results — canary condition true', async () => {
    const page = await loadFixture(browser, 'season-broken-structure.html');
    const extraction = await extractResults(page, 2025);
    await page.close();

    assert.equal(extraction.meetCount, 1);
    assert.equal(extraction.results.length, 0);
    assert.ok(extraction.meetCount > 0 && extraction.results.length === 0);
  });

  await t.test('broken-grade page: majority of rows missing a grade — ratio canary trips', async () => {
    const page = await loadFixture(browser, 'season-broken-grade.html');
    const extraction = await extractResults(page, 2025);
    await page.close();

    assert.equal(extraction.results.length, 2);
    assert.equal(extraction.missingGradeCount, 2);
    const ratio = extraction.missingGradeCount / extraction.results.length;
    assert.ok(ratio > MAX_MISSING_GRADE_RATIO);
  });
});
