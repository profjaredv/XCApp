const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCoachUpAnalysis, computeAthleteMetrics } = require('../lib/coachUpAnalysis');

function race(timeSec, distanceMeters, date) {
  return { timeSec, distanceMeters, date };
}

test('computeAthleteMetrics: null for fewer than 2 usable races', () => {
  assert.equal(computeAthleteMetrics({ id: 'a', races: [] }), null);
  assert.equal(computeAthleteMetrics({ id: 'a', races: [race(1000, 5000, '2025-09-01')] }), null);
});

test('computeAthleteMetrics: normalizes different distances to pace before comparing', () => {
  // Both races run at the same ~330 sec/mile pace, one at 5000m and one at
  // 3200m — improvement should read ~0, not swing wildly just because the
  // distance changed between races.
  const metrics = computeAthleteMetrics({
    id: 'a',
    races: [race(1025, 5000, '2025-09-01'), race(656, 3200, '2025-09-15')],
  });
  assert.ok(metrics);
  assert.ok(Math.abs(metrics.improvementPct) < 1);
});

test('computeAthleteMetrics: improvementPct is positive when pace gets faster over the season', () => {
  const metrics = computeAthleteMetrics({
    id: 'a',
    races: [race(1100, 5000, '2025-09-01'), race(1000, 5000, '2025-10-01')],
  });
  assert.ok(metrics.improvementPct > 0);
});

test('computeCoachUpAnalysis: never mixes genders when z-scoring', () => {
  // A boy who is average for boys and a girl who is average for girls
  // should score similarly, even if their raw paces are very different.
  const athletes = [
    { id: 'b1', gender: 'M', races: [race(1100, 5000, '2025-09-01'), race(1050, 5000, '2025-10-01')] },
    { id: 'b2', gender: 'M', races: [race(1200, 5000, '2025-09-01'), race(1150, 5000, '2025-10-01')] },
    { id: 'g1', gender: 'F', races: [race(1400, 5000, '2025-09-01'), race(1350, 5000, '2025-10-01')] },
    { id: 'g2', gender: 'F', races: [race(1500, 5000, '2025-09-01'), race(1450, 5000, '2025-10-01')] },
  ];
  const { athletes: scored } = computeCoachUpAnalysis(athletes, { topExcludeCount: 0 });
  const byId = Object.fromEntries(scored.map((a) => [a.id, a]));
  // Both are the faster half of their own gender group with an identical
  // 50s drop — their z-scores should land in the same neighborhood.
  assert.ok(Math.abs(byId.b1.combinedScore - byId.g1.combinedScore) < 0.5);
});

test('computeCoachUpAnalysis: excludes the fastest topExcludeCount from the watch list', () => {
  const athletes = Array.from({ length: 6 }, (_, i) => ({
    id: `a${i}`,
    gender: 'M',
    // Fastest (lowest pace) athlete is a0; a5 is slowest but most consistent+improving.
    races: [race(1000 + i * 60, 5000, '2025-09-01'), race(1000 + i * 60 - 60, 5000, '2025-10-01')],
  }));
  const { watchList } = computeCoachUpAnalysis(athletes, { topExcludeCount: 2, watchListSize: 10 });
  const watchIds = watchList.map((a) => a.id);
  assert.ok(!watchIds.includes('a0'), 'fastest athlete should be excluded as already visible');
  assert.ok(!watchIds.includes('a1'), 'second-fastest athlete should be excluded as already visible');
});

test('computeCoachUpAnalysis: flags a highly erratic athlete as a consistency concern', () => {
  const steady = (id) => ({
    id,
    gender: 'M',
    races: [race(1000, 5000, '2025-09-01'), race(1005, 5000, '2025-09-15'), race(1000, 5000, '2025-10-01')],
  });
  const erratic = {
    id: 'wild',
    gender: 'M',
    races: [race(900, 5000, '2025-09-01'), race(1300, 5000, '2025-09-15'), race(950, 5000, '2025-10-01')],
  };
  const athletes = [steady('s1'), steady('s2'), steady('s3'), steady('s4'), erratic];
  const { consistencyConcerns } = computeCoachUpAnalysis(athletes);
  assert.ok(consistencyConcerns.some((a) => a.id === 'wild'));
});

test('computeCoachUpAnalysis: flags a sliding veteran as a regression risk, not a newcomer with 2 races', () => {
  const stable = (id) => ({
    id,
    gender: 'F',
    races: [race(1200, 5000, '2025-09-01'), race(1195, 5000, '2025-09-15'), race(1190, 5000, '2025-10-01')],
  });
  const sliding = {
    id: 'vet',
    gender: 'F',
    races: [race(1200, 5000, '2025-09-01'), race(1230, 5000, '2025-09-15'), race(1280, 5000, '2025-10-01')],
  };
  const newcomerSliding = {
    id: 'new',
    gender: 'F',
    races: [race(1200, 5000, '2025-09-20'), race(1250, 5000, '2025-10-01')],
  };
  const athletes = [stable('s1'), stable('s2'), stable('s3'), stable('s4'), sliding, newcomerSliding];
  const { regressionRisks } = computeCoachUpAnalysis(athletes, { minRacesForRegressionRisk: 3 });
  const ids = regressionRisks.map((a) => a.id);
  assert.ok(ids.includes('vet'));
  assert.ok(!ids.includes('new'), 'fewer than minRacesForRegressionRisk races should not count as a regression risk');
});

test('computeCoachUpAnalysis: empty input returns empty results without throwing', () => {
  const result = computeCoachUpAnalysis([]);
  assert.deepEqual(result.athletes, []);
  assert.deepEqual(result.watchList, []);
  assert.deepEqual(result.consistencyConcerns, []);
  assert.deepEqual(result.regressionRisks, []);
});

test('computeCoachUpAnalysis: a lone athlete in a gender group scores 0 (no spread to compare against)', () => {
  const athletes = [{ id: 'solo', gender: 'M', races: [race(1000, 5000, '2025-09-01'), race(950, 5000, '2025-10-01')] }];
  const { athletes: scored } = computeCoachUpAnalysis(athletes);
  assert.equal(scored[0].consistencyZ, 0);
  assert.equal(scored[0].growthZ, 0);
});
