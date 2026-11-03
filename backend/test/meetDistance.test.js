// No reachable test database in this sandbox (same constraint as
// racePredictionsRoute.test.js and friends) — asserts PUT /:meetId's
// distance handling by source shape: it parses with the shared
// distance parser (never a second ad-hoc one), rejects what it can't
// parse rather than silently storing garbage, and regenerates any
// prediction already pending for the meet once a real distance is saved.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes', 'meetOps.js'), 'utf8');

function handlerFor(marker) {
  const start = ROUTES.indexOf(marker);
  assert.ok(start > -1, `could not find ${marker}`);
  return ROUTES.slice(start, ROUTES.indexOf('\n});', start));
}

const putHandler = handlerFor("router.put('/:meetId'");

test('PUT /:meetId parses distance with the one shared parser, not a second implementation', () => {
  assert.match(putHandler, /parseDistanceToMeters\(trimmed\)/);
});

test('an unparseable distance is rejected with a 400, never silently stored as null/garbage', () => {
  assert.match(putHandler, /if \(confirmedDistanceMeters == null\)/);
  assert.match(putHandler, /res\.status\(400\)/);
});

test('clearing the distance field clears both distance and distanceMeters', () => {
  assert.match(putHandler, /updates\.distance = null;/);
  assert.match(putHandler, /updates\.distanceMeters = null;/);
});

test('saving a real distance regenerates any prediction already pending for this meet', () => {
  assert.match(putHandler, /applyMeetDistanceToPendingPredictions\(req\.user\.teamId, meet\.id, confirmedDistanceMeters\)/);
});
