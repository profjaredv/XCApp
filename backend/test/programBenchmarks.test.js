// The program's own best season, which is the only yardstick this app has:
// there is no league, state or national reference data anywhere in it, and
// inventing some would be worse than having none.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSelfBenchmarks, getBenchmark, MIN_SEASONS_FOR_BEST } = require('../lib/programBenchmarks');

function season(year, overrides = {}) {
  return {
    season: year,
    participants: { total: 20 },
    racedCount: 18,
    raceMiles: 200,
    medianPace: { men: { paceSecPerMile: 400 }, women: { paceSecPerMile: 460 } },
    packSpread: { men: { spreadSec: 90 }, women: { spreadSec: 120 } },
    ...overrides,
  };
}

test('bigger is better for a roster', () => {
  const bests = buildSelfBenchmarks([season(2024, { participants: { total: 30 } }), season(2025)]);
  assert.equal(bests.rosterSize.value, 30);
  assert.equal(bests.rosterSize.season, 2024);
});

test('smaller is better for a pace and a pack spread', () => {
  // Getting this backwards would crown a program's worst year.
  const bests = buildSelfBenchmarks([
    season(2024, { medianPace: { men: { paceSecPerMile: 380 }, women: {} }, packSpread: { men: { spreadSec: 45 }, women: null } }),
    season(2025),
  ]);
  assert.equal(bests.medianPaceMen.value, 380);
  assert.equal(bests.medianPaceMen.season, 2024);
  assert.equal(bests.packSpreadMen.value, 45);
});

test('one season is the only reading, not a record', () => {
  assert.equal(MIN_SEASONS_FOR_BEST, 2);
  const bests = buildSelfBenchmarks([season(2025)]);
  assert.equal(bests.rosterSize.isRecord, false);
  assert.equal(bests.rosterSize.seasonsCompared, 1);
});

test('a metric no season has data for is absent, not zero', () => {
  const bests = buildSelfBenchmarks([
    season(2025, { packSpread: { men: null, women: null } }),
  ]);
  assert.equal(bests.packSpreadMen, undefined);
  assert.ok(bests.rosterSize, 'metrics that do have data are still there');
});

test('it says whether the record is the current season', () => {
  const rising = buildSelfBenchmarks([season(2024, { participants: { total: 10 } }), season(2025, { participants: { total: 40 } })]);
  assert.equal(rising.rosterSize.isCurrent, true);
  const falling = buildSelfBenchmarks([season(2024, { participants: { total: 40 } }), season(2025, { participants: { total: 10 } })]);
  assert.equal(falling.rosterSize.isCurrent, false);
});

test('external benchmarks are still honestly null', () => {
  // No league/state/national dataset exists in this app. A placeholder
  // number would be a lie a coach could act on.
  assert.deepEqual(getBenchmark(2025, 'M'), { league: null, state: null, national: null });
});
