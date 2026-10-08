// No reachable test database in this sandbox (same constraint as
// teamCurrentSeasonRoundTrip.test.js / teamsScrapePreservesFieldResults.test.js)
// — the arithmetic itself is fully unit-tested DB-free in
// racePrediction.test.js. These assert the route/service source's shape
// directly: the freeze-on-first-view policy, role gating, and the
// calibration hook's filtering, so a future edit can't silently change
// any of them without a test noticing.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROUTE = fs.readFileSync(path.join(__dirname, '..', 'routes', 'racePredictions.js'), 'utf8');
const CALC_SERVICE = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'performance', 'calculationService.js'),
  'utf8'
);

// A fixed-size window after the marker rather than hunting for a matching
// closing brace — simpler, and plenty for a substring assertion on a
// function this size.
function sectionFor(source, marker, windowSize = 1200) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `could not find ${marker}`);
  return source.slice(start, start + windowSize);
}

test('getOrCreatePrediction returns an existing frozen prediction instead of recomputing it', () => {
  const fn = sectionFor(ROUTE, 'async function getOrCreatePrediction');
  assert.match(fn, /findUnique/, 'must check for an existing prediction first');
  assert.match(fn, /if \(existing\) return/, 'an existing prediction must be returned as-is, not recomputed');
});

test('the next race is resolved from the schedule, never from MeetEntry — this team does not track entries', () => {
  const fn = sectionFor(ROUTE, 'async function findNextRaceForAthlete');
  assert.doesNotMatch(fn, /meetEntry/i, 'must not read MeetEntry at all');
  assert.match(fn, /prisma\.race\.findFirst/, 'must resolve the next race straight off the schedule');
});

test('getCurrentSeasonRosterAthleteIds never reads MeetEntry either — roster membership, not entry status', () => {
  const fn = sectionFor(ROUTE, 'async function getCurrentSeasonRosterAthleteIds');
  assert.doesNotMatch(fn, /meetEntry/i);
});

test('a prediction is refused for an athlete not on the current season roster', () => {
  const fn = sectionFor(ROUTE, "router.get('/athlete/:athleteId/next'");
  assert.match(fn, /getCurrentSeasonRosterAthleteIds/);
  assert.match(fn, /reason: 'not-on-roster'/);
});

test('the meet-wide view predicts the current season roster, not who was entered', () => {
  const fn = sectionFor(ROUTE, "router.get('/meet/:meetId'");
  assert.doesNotMatch(fn, /meetEntry/i);
  assert.match(fn, /getCurrentSeasonRosterAthleteIds/);
});

test('a same-day double distance is disambiguated by the athlete\'s own recent race distance, not guessed', () => {
  const fn = sectionFor(ROUTE, 'function pickRaceForAthlete');
  assert.match(fn, /preferredDistanceMeters/);
  assert.match(fn, /Math\.abs\(r\.distanceMeters - preferredDistanceMeters\)/);
});

test('recompute is gated to FULL_COACH, viewing a prediction is not', () => {
  const recompute = sectionFor(ROUTE, "router.post('/athlete/:athleteId/recompute'");
  assert.match(recompute, /requireRole\(FULL_COACH\)/);

  const view = sectionFor(ROUTE, "router.get('/athlete/:athleteId/next'");
  assert.doesNotMatch(view, /requireRole/, 'viewing a prediction must not require a coach role');
});

test('course difficulty rating uses no leave-one-out (rates the course, not one athlete)', () => {
  const fn = sectionFor(ROUTE, 'async function resolveCourseDifficultyForRace');
  assert.match(fn, /averageDelta\(contributors, null\)/);
});

test('an unrated course (no courseId, or no rated history) is never treated as a 0 adjustment', () => {
  const fn = sectionFor(ROUTE, 'async function resolveCourseDifficultyForRace');
  assert.match(fn, /if \(!race\.courseId\) return null;/);
});

test('scoreRacePredictions only touches unscored predictions for the given team/season', () => {
  const fn = sectionFor(CALC_SERVICE, 'async scoreRacePredictions');
  assert.match(fn, /scoredAt: null/);
  assert.match(fn, /where: \{ teamId, season, scoredAt: null \}/);
});

test('scoreRacePredictions matches the result by the exact athlete AND race, and requires FINISHED with a real time', () => {
  const fn = sectionFor(CALC_SERVICE, 'async scoreRacePredictions');
  assert.match(fn, /athleteId: prediction\.athleteId, raceId: prediction\.raceId, status: 'FINISHED', time: \{ gt: 0 \}/);
});

test('scoring never breaks the rest of a team metrics recalculation', () => {
  const fn = sectionFor(CALC_SERVICE, 'async _calculateAllMetrics');
  const callSite = fn.slice(fn.indexOf('scoreRacePredictions') - 200, fn.indexOf('scoreRacePredictions') + 50);
  assert.match(callSite, /try \{/, 'the call site must be wrapped so a prediction-scoring bug cannot throw out of the whole recalc');
});
