// Turns the season scraper's stderr into what a coach should be told.
// The scraper (scrape_season_playwright.js) logs per-attempt diagnostics:
// the final URL, the page title and the start of the page body.
//
// Two Athletic.net causes are recognisable and neither is a LeadPack
// fault, so they get a 502 (bad upstream) with a plain explanation:
//   - a Cloudflare bot check: page title "Just a moment..." / challenges.cloudflare.com
//   - a page without the results tables: the old Season.aspx URL now
//     redirects to Athletic.net's new /team/:id/cross-country/:year/results-grid
//     page, which the scraper can't read
// Anything else stays a 500.

const BOT_CHECK = /Just a moment\.\.\.|challenges\.cloudflare\.com/;
const NEW_RESULTS_PAGE = /\/team\/\d+\/cross-country\/\d+\/results-grid/;
const NO_TABLES = /never appeared, or its contents failed a structure check/;

function describeScrapeFailure(stderr = '') {
  const text = String(stderr);
  const botCheck = BOT_CHECK.test(text);
  const newPage = NEW_RESULTS_PAGE.test(text) && NO_TABLES.test(text);
  if (botCheck || newPage) {
    const why = [
      botCheck ? 'Athletic.net showed an automated-traffic check ("Just a moment...") that blocks the import' : null,
      newPage ? "Athletic.net now sends its season results to a new page the import can't read yet" : null,
    ]
      .filter(Boolean)
      .join(', and ');
    return {
      status: 502,
      message: `Couldn't import from Athletic.net: ${why}. Nothing in LeadPack was changed. For a meet you need now, add its results with Field Results.`,
    };
  }
  return { status: 500, message: 'Failed to scrape data.' };
}

module.exports = { describeScrapeFailure };
