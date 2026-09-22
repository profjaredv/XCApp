// GET /api/meets/:id — every result now carries real pr/seasonBest flags
// (lib/personalRecords.js) instead of the two fields that were always
// undefined here, which made every "PR" badge in the app read "No"
// regardless of what actually happened.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'meets.js'), 'utf8');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

const getRoute = code.slice(code.indexOf("router.get('/:id'"));

test('computes PR/season-best rather than passing through an unset field', () => {
  assert.match(code, /require\('\.\.\/lib\/personalRecords'\)/);
  assert.match(getRoute, /computePrFlagsByRace/);
  assert.match(getRoute, /pr: flags\.pr/);
  assert.match(getRoute, /seasonBest: flags\.seasonBest/);
});

test('compares only within the same distance as this race', () => {
  assert.match(getRoute, /Math\.round\(row\.race\.distanceMeters\) !== raceDistanceKey/);
});

test('skips the PR comparison entirely when this race has no distance, rather than guessing', () => {
  assert.match(getRoute, /if \(raceDistanceKey != null && athleteIds\.length > 0\)/);
});

test('only counts FINISHED results toward a PR — a DNF time is not a record', () => {
  const query = getRoute.slice(getRoute.indexOf('prisma.result.findMany'), getRoute.indexOf('const rowsByAthleteId'));
  assert.match(query, /status: 'FINISHED'/);
});

test('is scoped to the caller\'s own team', () => {
  const query = getRoute.slice(getRoute.indexOf('prisma.result.findMany'), getRoute.indexOf('const rowsByAthleteId'));
  assert.match(query, /teamId: req\.user\.teamId/);
});

test('defaults to false rather than leaving the field unset for a result outside the flagged set', () => {
  assert.match(getRoute, /\|\| \{ pr: false, seasonBest: false \}/);
});
