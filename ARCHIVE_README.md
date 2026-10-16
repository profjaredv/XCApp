# Athletic.net scrapers (archived 2026-10)

LeadPack stopped fetching Athletic.net pages from its own servers in October 2026.
Athletic.net's Terms of Use prohibit automated access, its Cloudflare bot check
blocks server-side requests, and its team pages moved to a client-rendered
(Angular) app the scrapers cannot read. Coaches now copy results from the page
they already have open and paste them into LeadPack (Data Management -> Update
results), and upload a roster file.

This branch (`archive/athletic-net-scrapers`, tag `scrapers-archive-2026-10`) is
a snapshot of `neon-migration` at commit `6d25e19` (Time trial vs race pace, #106),
**with the scrapers fully intact**, so they can be revived if Athletic.net ever
grants permission or a data partnership. Nothing here is deleted from this
snapshot; the removal happens on `neon-migration` only.

## What is in the snapshot

| File | What it does | Pages it reads |
|---|---|---|
| `backend/scrape_season_playwright.js` | Season results: every meet, every athlete's time. Playwright/Chromium. Used in production (Railway). | `https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID=<athleticTeamId>&S=<year>` (server-rendered `#M_Table` / `#F_Table` grids, meet list, athlete links) |
| `backend/scrape_season.py` | The same, with Selenium + BeautifulSoup. Used in local development. | same URL |
| `backend/scrape_roster_playwright.js` | Roster, including athletes with no results yet (the preseason case). Clicks the page's "Roster" tab and `ShowAthletes` / `click_M` / `click_F` reveals, then parses the same tables. | same URL |
| `backend/scrape_roster.py` | The same, Selenium version (written from the pre-migration codebase; never confirmed against the live page). | same URL |
| `backend/debug_page_source.py` | Dev tool: dumps the structure of the season page (sups, meet list). | same URL |
| `backend/lib/scrapeFailure.js` | Turns a scraper's stderr into a coach-readable 502 (bot check, or a page without the tables). | none |
| `backend/test/scraper.test.js` + fixtures `backend/test/fixtures/season-*.html` | Parsing tests against saved copies of the old page. | none |

Not part of this archive and still in use: `backend/scrape_google_photos_album.js`
(Google Photos albums, also Playwright; it never touches Athletic.net) and
`backend/lib/icalMeets.js` (a plain HTTPS GET of the team's public calendar feed).

## How they are invoked

All scrapers take two arguments and print the result as CSV on **stdout**
(diagnostics go to stderr, so the parent can tell them apart):

```
node backend/scrape_season_playwright.js --team_id <athleticTeamId> --year <season>
python3 backend/scrape_season.py        --team_id <athleticTeamId> --year <season>
node backend/scrape_roster_playwright.js --team_id <athleticTeamId> --year <season>
python3 backend/scrape_roster.py         --team_id <athleticTeamId> --year <season>
```

The server spawns them from `backend/routes/teams.js` (an argument array, never a shell):

- `POST /api/teams/scrape` (head coach / coach) runs the season scraper, then
  `importSeasonCsv()` writes races and results (idempotent upserts keyed on team + meet name + date + distance).
- `POST /api/teams/scrape-roster` runs the roster scraper and merges into `SeasonRoster`
  (never deletes; flags an athlete no longer listed as `flaggedForRemoval`).
- Playwright script on Railway or production (`RAILWAY_ENVIRONMENT` or `NODE_ENV=production`),
  the Python script otherwise.

Season CSV columns: `Race Name, Athlete Name, Grade, Gender, Time, Race Date, Distance,
Source URL, Athletic Meet ID, Athletic Athlete ID`.

UI entry points (web): `ScraperControls.tsx`, `ImportDataPanel.tsx`, `useDataManagement.ts`,
`dataManagementService.ts`, `rosterService.ts`, and the "Sync from Athletic.net" buttons on
`RosterPage.tsx`, `SchedulePage.tsx` and `PageHeader.tsx`.

## Dependencies

- Node: `playwright` (`backend/package.json`), plus Chromium (`npx playwright install chromium --with-deps`).
- Python (dev only; not pinned in a requirements file): `selenium`, `webdriver-manager`, `beautifulsoup4`, and Chrome.
- A Playwright scraper presents a normal desktop-Chrome user agent, viewport and locale; headless Chromium's default
  user agent is served a challenge page. It retries three times and writes diagnostics to stderr.

## Environment and deploy settings

- `nixpacks.toml` install phase runs `cd backend && npx playwright install chromium --with-deps`
  (still needed by the Google Photos scraper, so it stays on `neon-migration`).
- `railway.toml`: nixpacks builder; no scraper-specific settings.
- Env: `RAILWAY_ENVIRONMENT` / `NODE_ENV=production` chooses the Playwright script. No credentials are used;
  the team's `athleticTeamId` (Athletic.net school id) comes from the team record.

## State when they stopped working

- Server requests to Athletic.net get Cloudflare's "Just a moment..." challenge.
- Even when reachable, `Season.aspx` redirects to `/team/<id>/cross-country/<year>/results-grid`, an Angular page
  with no `#M_Table` / `#F_Table`. The tables the scrapers read no longer exist.
- The replacement parsers (written against the new page) live on `neon-migration`:
  `web/src/lib/gridTextParse.ts`, `web/src/lib/resultsGridPaste.ts`.

## How to revive them (only with Athletic.net's permission)

1. Get written permission or a data agreement from Athletic.net first. Do not revive these to get around the bot check.
2. Check out this tag, or cherry-pick the files above and the two routes in `routes/teams.js`.
3. Restore the UI buttons and `ScraperControls.tsx`.
4. Re-read the page: the selectors target the old server-rendered `Season.aspx`. Against the Angular results grid
   they would need rewriting (use `web/src/lib/resultsGridPaste.ts` for the new structure).
5. Run `backend/test/scraper.test.js` and the fixtures first; the import path (`importSeasonCsv`) is unchanged and idempotent.
