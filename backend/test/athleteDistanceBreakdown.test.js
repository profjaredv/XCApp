const test = require('node:test');
const assert = require('node:assert/strict');
const calculationService = require('../services/performance/calculationService');

// Pure-logic pieces of calculateAthleteDistanceBreakdown (routes/
// enhancedPerformanceRoutes.js's GET /distance-analysis/:season) — the
// bucketing/stats math over already-fetched result rows, no Prisma
// involved. calculateAthleteDistanceBreakdown itself queries the DB, so
// it isn't covered here; these two helpers are where the actual math is.

test('_athleteDistanceStats: empty bucket returns zeroed stats, not a throw', () => {
  const stats = calculationService._athleteDistanceStats([]);
  assert.deepEqual(stats, { count: 0, bestTime: 0, worstTime: 0, avgTime: 0, avgPace: 0, consistency: 0, totalMiles: 0 });
});

test('_athleteDistanceStats: computes count/best/worst/avg/pace/consistency for a single distance bucket', () => {
  // Two 1-mile (1609.34m) races: 300s and 340s.
  const rows = [
    { time: 300, race: { distanceMeters: 1609.34 } },
    { time: 340, race: { distanceMeters: 1609.34 } },
  ];
  const stats = calculationService._athleteDistanceStats(rows);
  assert.equal(stats.count, 2);
  assert.equal(stats.bestTime, 300);
  assert.equal(stats.worstTime, 340);
  assert.equal(stats.avgTime, 320);
  // avgPace = totalTime / totalMiles = 640 / 2 = 320 (1 mile races, so pace == time)
  assert.equal(stats.avgPace, 320);
  // Perfectly identical times would give consistency 0; these two differ,
  // so consistency should be a positive coefficient-of-variation percentage.
  assert.ok(stats.consistency > 0);
});

test('_athleteDistanceStats: identical times are perfectly consistent (0)', () => {
  const rows = [
    { time: 300, race: { distanceMeters: 1609.34 } },
    { time: 300, race: { distanceMeters: 1609.34 } },
  ];
  const stats = calculationService._athleteDistanceStats(rows);
  assert.equal(stats.consistency, 0);
});

test('_athleteOtherStats: empty leftover returns zeroed stats', () => {
  assert.deepEqual(calculationService._athleteOtherStats([]), { count: 0, avgTime: 0, avgPace: 0, totalMiles: 0 });
});

test('_athleteOtherStats: aggregates a mixed-distance leftover bucket', () => {
  // A 2-mile race (3218.68m, 1000s) and an 8K race (8000m, 1900s) — neither
  // falls in the named buckets, so both land in "other."
  const rows = [
    { time: 1000, race: { distanceMeters: 3218.68 } },
    { time: 1900, race: { distanceMeters: 8000 } },
  ];
  const stats = calculationService._athleteOtherStats(rows);
  assert.equal(stats.count, 2);
  assert.equal(stats.avgTime, 1450);
  assert.ok(stats.totalMiles > 6.9 && stats.totalMiles < 7);
});
