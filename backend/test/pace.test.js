const test = require('node:test');
const assert = require('node:assert/strict');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const { MILE_IN_METERS } = require('../lib/distance');

// F1 (XCApp pre-season fixes doc): six call sites divided every race's
// finish time by a hardcoded 3.10686 (miles in a 5K) regardless of the
// race's actual distance — a 2-mile race reported a pace ~55% slower than
// reality, an 8K reported faster than reality. This is the regression test
// named in that doc's Verify Gate A: each of these distances, at a chosen
// finish time, must land within 1 sec/mile of its hand-calculated pace.
const distances = [
  { label: '2-mile', meters: 2 * MILE_IN_METERS, timeSec: 720 },
  { label: '5K', meters: 5000, timeSec: 1000 },
  { label: '6K', meters: 6000, timeSec: 1200 },
  { label: '8K', meters: 8000, timeSec: 1600 },
];

for (const { label, meters, timeSec } of distances) {
  test(`paceSecPerMile: a ${label} race lands within 1 sec/mile of the hand-calculated pace`, () => {
    const miles = meters / MILE_IN_METERS;
    const expected = timeSec / miles;
    const actual = paceSecPerMile(timeSec, meters);
    assert.ok(
      Math.abs(actual - expected) < 1,
      `expected ~${expected.toFixed(2)} s/mile for ${label}, got ${actual}`
    );
  });
}

test('paceSecPerMile: never assumes every race is a 5K — same finish time, different distances, different paces', () => {
  // The old bug (time / 3.10686 everywhere) would have made a 2-mile and a
  // 5K at the same raw finish time report the exact same pace. They must
  // not: a shorter race covers less ground in that time, so its pace per
  // mile is slower.
  const twoMilePace = paceSecPerMile(720, 2 * MILE_IN_METERS);
  const fiveKPace = paceSecPerMile(720, 5000);
  assert.ok(twoMilePace > fiveKPace + 30, `expected 2-mile pace (${twoMilePace}) to be well slower than 5K pace (${fiveKPace}) at the same finish time`);
});

test('paceSecPerMile: an 8K and a 5K at proportionally scaled finish times produce the same pace', () => {
  // Sanity check in the other direction — scaling the finish time with the
  // distance should hold pace constant, confirming the function is
  // distance-aware rather than distance-blind.
  const fiveKPace = paceSecPerMile(1000, 5000);
  const eightKPace = paceSecPerMile(1000 * (8000 / 5000), 8000);
  assert.ok(Math.abs(fiveKPace - eightKPace) < 0.01);
});
