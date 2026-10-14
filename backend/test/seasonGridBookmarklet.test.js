// Runs the Results Grid bookmarklet (web/src/lib/seasonGridBookmarklet.ts)
// in real Chromium against a synthetic copy of Athletic.net's grid, served
// at the real URL so the bookmarklet's own URL check runs too. Same browser
// setup as scraper.test.js. The CSV it produces is then put through the
// server's own paste check (lib/seasonCsv.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { parse } = require('csv-parse/sync');
const { checkSeasonCsv } = require('../lib/seasonCsv');

function bookmarkletSource() {
  const ts = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'src', 'lib', 'seasonGridBookmarklet.ts'), 'utf8');
  const open = 'const BOOKMARKLET_SOURCE = `';
  const raw = ts.slice(ts.indexOf(open) + open.length, ts.indexOf('`.trim();'));
  // Resolve the template literal's escapes exactly as the TS module does;
  // the source is this repo's own file, not outside input.
  return new Function('return `' + raw + '`;')().trim();
}

test('Results Grid bookmarklet', async (t) => {
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  t.after(() => browser.close());
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'results-grid-2026.html'), 'utf8');
  const source = bookmarkletSource();

  async function open(url) {
    const page = await browser.newPage();
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.route('**/*', (r) => (r.request().url() === url ? r.fulfill({ status: 200, contentType: 'text/html', body: html }) : r.abort()));
    await page.goto(url);
    return { page, dialogs };
  }

  await t.test('reads both genders into the scraper CSV and switches back', async () => {
    const { page } = await open('https://www.athletic.net/team/1/cross-country/2026/results-grid');
    await page.evaluate(source);
    await page.waitForSelector('#leadpack-season-import', { timeout: 15000 });
    const summary = await page.locator('#leadpack-season-import .lp-sum').innerText();
    const csv = await page.locator('#leadpack-season-import .lp-text').inputValue();
    assert.match(summary, /2026: 3 boys results and 1 girls results across 2 meets\./);

    const rows = parse(csv, { columns: true });
    assert.deepEqual(Object.keys(rows[0]), ['Race Name', 'Athlete Name', 'Grade', 'Gender', 'Time', 'Race Date', 'Distance', 'Source URL', 'Athletic Meet ID', 'Athletic Athlete ID']);
    assert.deepEqual(rows[0], {
      'Race Name': 'Test Time Trial',
      'Athlete Name': 'Alex Runner',
      Grade: '11',
      Gender: 'Men',
      Time: '6:39.0',
      'Race Date': 'Sep 8, 2026',
      Distance: '1 Miles',
      'Source URL': 'https://www.athletic.net/CrossCountry/meet/9001/results',
      'Athletic Meet ID': '9001',
      'Athletic Athlete ID': 'https://www.athletic.net/athlete/1001/cross-country',
    });
    // An empty cell is skipped, an entity in a meet name is decoded, quotes survive the CSV.
    assert.equal(rows.filter((r) => r['Athlete Name'] === 'Blake Stride').length, 1);
    assert.equal(rows[1]['Race Name'], 'Test & Friends Invitational');
    const girl = rows.find((r) => r.Gender === 'Women');
    assert.equal(girl['Athlete Name'], 'Casey "CJ" Pace');
    assert.equal(girl.Distance, '5000 Meters');

    const check = checkSeasonCsv(csv, 2026);
    assert.equal(check.ok, true);
    assert.equal(check.genders.size, 2);

    await page.waitForTimeout(500);
    assert.match(await page.locator('.gender-switch button.active').innerText(), /Mens/);
  });

  await t.test('refuses to run anywhere but a Results Grid page', async () => {
    const { page, dialogs } = await open('https://www.athletic.net/team/1/cross-country/2026');
    await page.evaluate(source);
    assert.equal(await page.locator('#leadpack-season-import').count(), 0);
    assert.match(dialogs[0] || '', /Results Grid/);
  });
});
