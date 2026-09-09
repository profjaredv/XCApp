const test = require('node:test');
const assert = require('node:assert/strict');
const calculationService = require('../services/performance/calculationService');

// AthleteSeasonMetrics.bestTime5k is read with `orderBy: { bestTime5k:
// { sort: 'asc', nulls: 'last' } }` (routes/analytics.js) to rank the
// season's Athletes list fastest-first. calculateAthleteRaceMetrics used
// to return 0 (not null) for an athlete with no 5K on record, and that 0
// got written straight into bestTime5k — defeating the nulls:'last'
// guard and sorting every non-5K athlete to the very top, displayed as a
// "0:00" top runner.

function race(overrides = {}) {
  return {
    time: 1000,
    distance: 3.1,
    distanceText: '5,000 Meters',
    meetName: 'Test Invite',
    date: '2024-09-01',
    ...overrides,
  };
}

test('calculateAthleteRaceMetrics', async (t) => {
  await t.test('best5kTime is null, not 0, for an athlete with no 5K race this season', () => {
    const races = [race({ distance: 2.0, distanceText: '3200 Meters', time: 700 })];
    const metrics = calculationService.calculateAthleteRaceMetrics(races);
    assert.equal(metrics.best5kTime, null);
  });

  await t.test('best5kTime is the fastest actual 5K time when one exists', () => {
    const races = [
      race({ time: 1100 }),
      race({ time: 1000 }),
      race({ distance: 2.0, distanceText: '3200 Meters', time: 600 }), // not a 5K — must not win on raw time
    ];
    const metrics = calculationService.calculateAthleteRaceMetrics(races);
    assert.equal(metrics.best5kTime, 1000);
  });

  await t.test('an all-non-5K season still computes everything else normally, just without a 5K best', () => {
    const races = [race({ distance: 2.0, distanceText: '3200 Meters', time: 700 })];
    const metrics = calculationService.calculateAthleteRaceMetrics(races);
    assert.equal(metrics.best5kTime, null);
    assert.equal(metrics.totalRaces, 1);
    assert.ok(metrics.bestPace > 0);
  });
});
