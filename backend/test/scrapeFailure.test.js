const test = require('node:test');
const assert = require('node:assert/strict');
const { describeScrapeFailure } = require('../lib/scrapeFailure');

// Shapes taken from the production log of 2026-10-14 (team 460, 2026).
const redirected = `Attempt 1 failed: page.waitForSelector: Timeout 35000ms exceeded.
final URL : https://www.athletic.net/team/460/cross-country/2026/results-grid
page title: Ellensburg - High School Cross Country 2026
Fatal error: Error: Results grid (#M_Table, #F_Table) never appeared, or its contents failed a structure check, after 3 attempts`;
const challenged = `final URL : https://www.athletic.net/team/460/cross-country/2026/results-grid
page title: Just a moment...
body[0..1500]: <script src="https://challenges.cloudflare.com/x"></script>`;

test('describeScrapeFailure', async (t) => {
  await t.test('a bot check is a 502 that names Athletic.net and points to Field Results', () => {
    const r = describeScrapeFailure(challenged);
    assert.equal(r.status, 502);
    assert.match(r.message, /automated-traffic check/);
    assert.match(r.message, /Field Results/);
    assert.match(r.message, /Nothing in LeadPack was changed/);
  });
  await t.test('the redirect to the new results page is named too', () => {
    const r = describeScrapeFailure(redirected);
    assert.equal(r.status, 502);
    assert.match(r.message, /new page/);
  });
  await t.test('both at once reads as one sentence', () => {
    const r = describeScrapeFailure(`${redirected}\n${challenged}`);
    assert.match(r.message, /check .* blocks the import, and Athletic.net now sends/);
  });
  await t.test('anything else stays a 500', () => {
    assert.deepEqual(describeScrapeFailure('Error: spawn ENOENT'), { status: 500, message: 'Failed to scrape data.' });
  });
});
