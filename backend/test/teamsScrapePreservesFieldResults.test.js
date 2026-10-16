// Re-importing an already-imported season, used to
// unconditionally wipe every non-manual race for that season BEFORE
// re-scraping — "just in case" a meet was removed. But the upsert further
// down already matches an existing race by its natural key (teamId, name,
// date, distance) and updates it IN PLACE, preserving its id. Deleting the
// race first fought that: a race the fresh scrape still described got
// deleted and recreated with a brand-new id anyway, silently cascading away
// any FieldResult/RaceSplit rows a coach had manually added against the old
// one (both onDelete: Cascade off Race) — the actual incident this guards
// against (a coach's field-results upload, and once before, splits,
// vanishing after "pulling updated results").
//
// No reachable test database in this sandbox (the real fix needs a live
// Postgres to prove id-preservation end to end) — so, same as
// teamCurrentSeasonRoundTrip.test.js, this asserts the route's own source
// text has the right shape: no blanket pre-delete, and the only remaining
// race deletion is a diff computed AFTER the import loop, gated on which
// race identities the scrape actually saw.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes', 'teams.js'), 'utf8');

// The import itself now lives in importSeasonCsv, used by
// POST /import-season-csv (the coach's pasted Results Grid copy), so
// it gets the same protections. The assertions below run against it.
function importFunction() {
  const start = ROUTES.indexOf('async function importSeasonCsv(');
  assert.ok(start > -1, 'could not find importSeasonCsv');
  const end = ROUTES.indexOf("\n// POST /api/teams/import-season-csv", start);
  assert.ok(end > start, 'could not find the end of importSeasonCsv');
  return ROUTES.slice(start, end);
}

const scrapeHandler = importFunction();

test('the season import goes through importSeasonCsv', () => {
  assert.match(ROUTES, /const summary = await importSeasonCsv\(req\.user\.team, yearNum, csv, /);
});

test('/scrape no longer deletes races before re-scraping', () => {
  const loopStart = scrapeHandler.indexOf('for (const rowData of records)');
  assert.ok(loopStart > -1, 'could not find the per-row import loop');

  const beforeLoop = scrapeHandler.slice(0, loopStart);
  assert.doesNotMatch(
    beforeLoop,
    /race\.deleteMany/,
    'a race must never be deleted before the upsert loop runs — that is the bug: it deletes a race the scrape is about to update in place anyway, cascading away its FieldResult/RaceSplit rows'
  );
});

test('/scrape tracks every race identity the scrape actually saw', () => {
  assert.match(
    scrapeHandler,
    /const touchedRaceKeys = new Set\(\);/,
    'must track which races this scrape touched, to diff against afterward'
  );

  const loopStart = scrapeHandler.indexOf('for (const rowData of records)');
  const loopBody = scrapeHandler.slice(loopStart);
  assert.match(
    loopBody,
    /touchedRaceKeys\.add\(raceIdentityKey\(/,
    'each imported row must record its race identity as touched'
  );
});

test('/scrape only removes races AFTER the import loop, and only ones the scrape never saw', () => {
  const loopStart = scrapeHandler.indexOf('for (const rowData of records)');
  const loopEnd = scrapeHandler.indexOf('const updatedSeasons =');
  assert.ok(loopStart > -1 && loopEnd > loopStart, 'could not locate the import loop bounds');

  const afterLoop = scrapeHandler.slice(loopStart, loopEnd);
  assert.match(
    afterLoop,
    /race\.deleteMany/,
    'the only race deletion left must happen after the import loop'
  );
  assert.match(
    afterLoop,
    /!touchedRaceKeys\.has\(key\)/,
    'the post-loop deletion must be filtered to races the scrape did NOT see — never one it just upserted'
  );
});

test('a genuinely new race still gets its prior meetId restored (unchanged behavior)', () => {
  assert.match(
    scrapeHandler,
    /previousMeetIdByKey\.get\(raceIdentityKey\(raceName, parsedDate\.startOf\('day'\)\.toDate\(\), distance\)\) \?\? null/,
    'the upsert create branch must still restore a previously-known meetId by race identity'
  );
});
