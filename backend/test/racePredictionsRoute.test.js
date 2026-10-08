// No reachable test database in this sandbox (same constraint as
// teamCurrentSeasonRoundTrip.test.js / teamsScrapePreservesFieldResults.test.js)
// — the arithmetic itself is fully unit-tested DB-free in
// racePrediction.test.js. These assert the route/service source's shape
// directly: the freeze-on-first-view policy, role gating, the Meet-based
// (not Race-based) resolution, and the reconcile-then-score hook ordering,
// so a future edit can't silently change any of them without a test
// noticing.
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
function sectionFor(source, marker, windowSize = 1400) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `could not find ${marker}`);
  return source.slice(start, start + windowSize);
}

test('getOrCreatePrediction returns an existing frozen prediction instead of recomputing it', () => {
  const fn = sectionFor(ROUTE, 'async function getOrCreatePrediction');
  assert.match(fn, /findUnique/, 'must check for an existing prediction first');
  assert.match(fn, /if \(existing\) return/, 'an existing prediction must be returned as-is, not recomputed');
});

test('predictions are keyed on Meet, not Race — this team\'s races do not exist until after the meet', () => {
  const fn = sectionFor(ROUTE, 'async function findNextMeet');
  assert.doesNotMatch(fn, /meetEntry/i, 'must not read MeetEntry at all');
  assert.match(fn, /prisma\.meet\.findFirst/, 'must resolve the next MEET straight off the schedule, not a race');
});

test('a target with no real race yet estimates the distance from the athlete\'s own history, flagged as an estimate', () => {
  const fn = sectionFor(ROUTE, 'function buildTargetFromMeet', 2200);
  assert.match(fn, /distanceEstimated: true/);
  assert.match(fn, /if \(preferredDistanceMeters == null\) return null;/, 'must refuse to guess when there is nothing to estimate from either');
});

test('a coach-confirmed meet distance outranks guessing from the athlete\'s own history', () => {
  const fn = sectionFor(ROUTE, 'function buildTargetFromMeet', 2200);
  const meetDistanceAt = fn.indexOf('meet.distanceMeters != null');
  const estimateAt = fn.indexOf('preferredDistanceMeters == null) return null');
  assert.ok(meetDistanceAt > -1 && estimateAt > -1, 'both branches must be present');
  assert.ok(meetDistanceAt < estimateAt, 'the confirmed meet distance must be checked before falling back to a guess');
  // A confirmed meet distance is a real fact, not a stand-in — unlike the
  // athlete-estimate branch, it must not be flagged distanceEstimated: true.
  assert.doesNotMatch(fn.slice(meetDistanceAt, estimateAt), /distanceEstimated: true/);
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

test('course difficulty is only ever resolved for a real race, never an estimated target', () => {
  const fn = sectionFor(ROUTE, 'async function computeAndSavePrediction');
  assert.match(fn, /target\.courseId \? resolveCourseDifficultyForRace/, 'must gate on the target actually having a courseId');
});

test('course difficulty rating uses no leave-one-out (rates the course, not one athlete)', () => {
  const fn = sectionFor(ROUTE, 'async function resolveCourseDifficultyForRace');
  assert.match(fn, /averageDelta\(contributors, null\)/);
});

test('reconcilePendingPredictions runs before scoreRacePredictions in the same recalc pass', () => {
  const fn = sectionFor(CALC_SERVICE, 'async _calculateAllMetrics', 2200);
  const reconcileAt = fn.indexOf('this.reconcilePendingPredictions');
  const scoreAt = fn.indexOf('this.scoreRacePredictions');
  assert.ok(reconcileAt > -1 && scoreAt > -1, 'both calls must be present');
  assert.ok(reconcileAt < scoreAt, 'reconcile must run first — scoring looks up a result by raceId, which reconcile is what attaches');
  assert.match(fn.slice(Math.min(reconcileAt, scoreAt) - 50, scoreAt + 50), /try \{/, 'the call site must be wrapped so a prediction bug cannot throw out of the whole recalc');
});

test('reconcilePendingPredictions only touches predictions still missing a race', () => {
  const fn = sectionFor(CALC_SERVICE, 'async reconcilePendingPredictions');
  assert.match(fn, /where: \{ teamId, season, raceId: null \}/);
});

test('reconcilePendingPredictions never rewrites the actual forecast, only its translation into a time/splits', () => {
  const fn = sectionFor(CALC_SERVICE, 'async reconcilePendingPredictions', 1600);
  assert.doesNotMatch(fn, /trendPaceSecPerMile:/, 'must never touch the frozen trend');
  assert.doesNotMatch(fn, /biasAppliedSecPerMile:/, 'must never touch the frozen bias');
  assert.match(fn, /predictedTimeSec,/, 'must update the derived time');
  assert.match(fn, /predictedSplits,/, 'must update the derived splits');
});

test('scoreRacePredictions only matches predictions that already have a race attached', () => {
  const fn = sectionFor(CALC_SERVICE, 'async scoreRacePredictions');
  assert.match(fn, /raceId: \{ not: null \}/, 'a still-pending (meet-only) prediction has nothing to score against yet');
});

test('scoreRacePredictions matches the result by the exact athlete AND race, and requires FINISHED with a real time', () => {
  const fn = sectionFor(CALC_SERVICE, 'async scoreRacePredictions');
  assert.match(fn, /athleteId: prediction\.athleteId, raceId: prediction\.raceId, status: 'FINISHED', time: \{ gt: 0 \}/);
});

test('applyMeetDistanceToPendingPredictions only touches this meet\'s predictions still missing a race', () => {
  const fn = sectionFor(CALC_SERVICE, 'async applyMeetDistanceToPendingPredictions');
  assert.match(fn, /where: \{ teamId, meetId, raceId: null \}/);
});

test('applyMeetDistanceToPendingPredictions never rewrites the actual forecast either, same as reconcile', () => {
  const fn = sectionFor(CALC_SERVICE, 'async applyMeetDistanceToPendingPredictions', 1400);
  assert.doesNotMatch(fn, /trendPaceSecPerMile:/);
  assert.doesNotMatch(fn, /biasAppliedSecPerMile:/);
  assert.match(fn, /distanceEstimated: false/, 'a coach-confirmed distance is a real fact, not an estimate');
});

test('reconcilePendingPredictions and applyMeetDistanceToPendingPredictions share one derivation helper, not two', () => {
  assert.match(CALC_SERVICE, /async _derivedFieldsForDistance/, 'the shared helper must exist');
  const reconcile = sectionFor(CALC_SERVICE, 'async reconcilePendingPredictions', 1400);
  const applyMeetDistance = sectionFor(CALC_SERVICE, 'async applyMeetDistanceToPendingPredictions', 1400);
  assert.match(reconcile, /this\._derivedFieldsForDistance\(/);
  assert.match(applyMeetDistance, /this\._derivedFieldsForDistance\(/);
});
