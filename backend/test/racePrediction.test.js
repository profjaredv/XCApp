const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fitLinearTrend,
  projectSeasonFitness,
  computeBiasAndMargin,
  buildSplitShape,
  applySplitShape,
  buildRacePrediction,
  scorePrediction,
} = require('../lib/racePrediction');

test('fitLinearTrend: a perfect line fits exactly', () => {
  const fit = fitLinearTrend([
    { x: 0, y: 100 },
    { x: 10, y: 90 },
    { x: 20, y: 80 },
  ]);
  assert.ok(fit);
  assert.equal(fit.slope, -1);
  assert.equal(fit.intercept, 100);
});

test('fitLinearTrend: fewer than 2 points returns null', () => {
  assert.equal(fitLinearTrend([]), null);
  assert.equal(fitLinearTrend([{ x: 0, y: 100 }]), null);
});

test('fitLinearTrend: every point at the same x returns null, not a slope of 0 presented as a fit', () => {
  assert.equal(
    fitLinearTrend([
      { x: 5, y: 100 },
      { x: 5, y: 90 },
    ]),
    null
  );
});

test('projectSeasonFitness: no history returns null', () => {
  assert.equal(projectSeasonFitness([], new Date('2026-10-01')), null);
});

test('projectSeasonFitness: one race is a flat baseline, no trend', () => {
  const result = projectSeasonFitness(
    [{ date: new Date('2026-09-01'), adjustedPaceSecPerMile: 360 }],
    new Date('2026-10-01')
  );
  assert.deepEqual(result, { trendPaceSecPerMile: 360, slopeSecPerMilePerDay: 0, basedOnRaceCount: 1 });
});

test('projectSeasonFitness: two or more races fit a trend between race days', () => {
  // Getting 1 sec/mile faster every day, started at 360 sec/mile on day 0.
  const history = [
    { date: new Date('2026-09-01T00:00:00Z'), adjustedPaceSecPerMile: 360 },
    { date: new Date('2026-09-11T00:00:00Z'), adjustedPaceSecPerMile: 350 },
    { date: new Date('2026-09-21T00:00:00Z'), adjustedPaceSecPerMile: 340 },
  ];
  // Day 5, within the fitted range (no floor in play) => 360 - 1*5 = 355.
  const result = projectSeasonFitness(history, new Date('2026-09-06T00:00:00Z'));
  assert.equal(result.slopeSecPerMilePerDay, -1);
  assert.ok(Math.abs(result.trendPaceSecPerMile - 355) < 1e-9);
  assert.equal(result.basedOnRaceCount, 3);
});

test('projectSeasonFitness: extrapolating past the data is floored at the fastest pace already run', () => {
  const history = [
    { date: new Date('2026-09-01T00:00:00Z'), adjustedPaceSecPerMile: 360 },
    { date: new Date('2026-09-11T00:00:00Z'), adjustedPaceSecPerMile: 350 },
    { date: new Date('2026-09-21T00:00:00Z'), adjustedPaceSecPerMile: 340 },
  ];
  // 40 days after the first race, the raw trend line says 360 - 1*40 = 320 —
  // faster than this athlete's best (340) by a margin nothing in the data
  // supports. The floor holds it at 340 instead.
  const result = projectSeasonFitness(history, new Date('2026-10-11T00:00:00Z'));
  assert.equal(result.slopeSecPerMilePerDay, -1, 'the reported slope is still the honest fit, only the extrapolated pace is floored');
  assert.ok(Math.abs(result.trendPaceSecPerMile - 340) < 1e-9);
});

test('projectSeasonFitness: unsorted input is sorted before fitting', () => {
  const history = [
    { date: new Date('2026-09-21T00:00:00Z'), adjustedPaceSecPerMile: 340 },
    { date: new Date('2026-09-01T00:00:00Z'), adjustedPaceSecPerMile: 360 },
  ];
  const result = projectSeasonFitness(history, new Date('2026-09-01T00:00:00Z'));
  assert.ok(Math.abs(result.trendPaceSecPerMile - 360) < 1e-9);
});

test('computeBiasAndMargin: no prior scored predictions returns nulls', () => {
  assert.deepEqual(computeBiasAndMargin([]), { biasSecPerMile: null, marginSecPerMile: null });
});

test('computeBiasAndMargin: a single error is a bias with no margin yet', () => {
  assert.deepEqual(computeBiasAndMargin([5]), { biasSecPerMile: 5, marginSecPerMile: null });
});

test('computeBiasAndMargin: consistently fast predictions (actual always slower) show as a positive bias with zero spread', () => {
  const result = computeBiasAndMargin([5, 5, 5]);
  assert.equal(result.biasSecPerMile, 5);
  assert.equal(result.marginSecPerMile, 0);
});

test('computeBiasAndMargin: mixed errors average out, margin reflects the spread around the mean', () => {
  // mean = 0, residuals [-10, 10], population variance = 100, margin = 10.
  const result = computeBiasAndMargin([-10, 10]);
  assert.equal(result.biasSecPerMile, 0);
  assert.equal(result.marginSecPerMile, 10);
});

test('buildSplitShape: fewer than 2 segments returns null', () => {
  assert.equal(buildSplitShape([{ fromMeters: 0, toMeters: 1600, paceSecPerMile: 360 }], 360, 1600), null);
});

test('buildSplitShape: no overall pace to compare against returns null', () => {
  const segs = [
    { fromMeters: 0, toMeters: 1600, paceSecPerMile: 350 },
    { fromMeters: 1600, toMeters: 3200, paceSecPerMile: 370 },
  ];
  assert.equal(buildSplitShape(segs, null, 3200), null);
});

test('buildSplitShape: ratios express each segment relative to the overall pace', () => {
  const segs = [
    { fromMeters: 0, toMeters: 1609.34, paceSecPerMile: 342 }, // 5% faster than overall
    { fromMeters: 1609.34, toMeters: 3218.68, paceSecPerMile: 378 }, // 5% slower than overall
  ];
  const shape = buildSplitShape(segs, 360, 3218.68);
  assert.equal(shape.length, 2);
  assert.ok(Math.abs(shape[0].ratio - 0.95) < 1e-9);
  assert.ok(Math.abs(shape[1].ratio - 1.05) < 1e-9);
  assert.ok(Math.abs(shape[0].toFraction - 0.5) < 1e-9);
});

test('applySplitShape: null shape (no reference splits) predicts even pacing', () => {
  const markers = [{ sequence: 1, markerMeters: 1609.34, label: 'Mile 1' }];
  const splits = applySplitShape(360, 3218.68, markers, null, 'Final');
  assert.equal(splits.length, 2);
  assert.ok(Math.abs(splits[0].predictedElapsedSec - 360) < 1e-6); // 1 mile at 360 sec/mile
  assert.ok(Math.abs(splits[1].predictedElapsedSec - 720) < 1e-6); // 2 miles total
  assert.equal(splits[1].label, 'Final');
});

test('applySplitShape: a fast-start shape produces a faster first segment and slower second, still summing to the full time', () => {
  const markers = [{ sequence: 1, markerMeters: 1609.34, label: 'Mile 1' }];
  const shape = [
    { fromFraction: 0, toFraction: 0.5, ratio: 0.95 },
    { fromFraction: 0.5, toFraction: 1, ratio: 1.05 },
  ];
  const splits = applySplitShape(360, 3218.68, markers, shape, 'Final');
  assert.ok(Math.abs(splits[0].predictedElapsedSec - 360 * 0.95) < 1e-6);
  assert.ok(Math.abs(splits[1].predictedElapsedSec - 720) < 1e-6); // still the same overall time
});

test('buildRacePrediction: course rating adds back onto the course-neutral trend', () => {
  const prediction = buildRacePrediction({
    trend: { trendPaceSecPerMile: 350, basedOnRaceCount: 3 },
    courseDifficultySecPerMile: 10, // a hard course costs 10 sec/mile
    bias: null,
    distanceMeters: 3218.68, // 2 miles
    markers: [],
    splitShape: null,
    closingLabel: 'Final',
  });
  assert.equal(prediction.predictedPaceSecPerMile, 360);
  assert.ok(Math.abs(prediction.predictedTimeSec - 720) < 1e-6);
  assert.equal(prediction.courseDifficultySecPerMile, 10);
  assert.equal(prediction.biasAppliedSecPerMile, null);
});

test('buildRacePrediction: unrated course leaves courseDifficultySecPerMile null, not 0', () => {
  const prediction = buildRacePrediction({
    trend: { trendPaceSecPerMile: 350, basedOnRaceCount: 2 },
    courseDifficultySecPerMile: null,
    bias: null,
    distanceMeters: 1609.34,
    markers: [],
    splitShape: null,
    closingLabel: 'Final',
  });
  assert.equal(prediction.predictedPaceSecPerMile, 350);
  assert.equal(prediction.courseDifficultySecPerMile, null);
});

test('buildRacePrediction: a learned bias shifts the final prediction', () => {
  const prediction = buildRacePrediction({
    trend: { trendPaceSecPerMile: 350, basedOnRaceCount: 4 },
    courseDifficultySecPerMile: 0,
    bias: { biasSecPerMile: -5, marginSecPerMile: 3 }, // this athlete has run 5 sec/mile faster than predicted, on average
    distanceMeters: 1609.34,
    markers: [],
    splitShape: null,
    closingLabel: 'Final',
  });
  assert.equal(prediction.predictedPaceSecPerMile, 345);
  assert.equal(prediction.biasAppliedSecPerMile, -5);
  assert.equal(prediction.marginSecPerMile, 3);
});

test('buildRacePrediction: never predicts a zero or negative pace even from a runaway extrapolation', () => {
  const prediction = buildRacePrediction({
    trend: { trendPaceSecPerMile: 10, basedOnRaceCount: 2 },
    courseDifficultySecPerMile: 0,
    bias: { biasSecPerMile: -50, marginSecPerMile: 1 },
    distanceMeters: 1609.34,
    markers: [],
    splitShape: null,
    closingLabel: 'Final',
  });
  assert.ok(prediction.predictedPaceSecPerMile > 0);
});

test('scorePrediction: computes actual pace and signed error (actual - predicted)', () => {
  const result = scorePrediction(360, 720, 3218.68); // ran 2 miles in 720s = 360 sec/mile exactly
  assert.ok(Math.abs(result.actualPaceSecPerMile - 360) < 1e-6);
  assert.equal(result.actualTimeSec, 720);
  assert.ok(Math.abs(result.errorSecPerMile - 0) < 1e-6);
});

test('scorePrediction: a faster-than-predicted result is a negative error', () => {
  const result = scorePrediction(360, 700, 3218.68); // faster than predicted
  assert.ok(result.errorSecPerMile < 0);
});

test('scorePrediction: null time or distance returns null, never a fabricated comparison', () => {
  assert.equal(scorePrediction(360, null, 3218.68), null);
  assert.equal(scorePrediction(360, 720, null), null);
});
