const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN_FIELD_SIZE, computeFieldStats, fieldRatio } = require('../lib/fieldNormalization');

function times(n, start, step) {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

test('computeFieldStats returns null mean/median below the 40-finisher threshold', () => {
  const stats = computeFieldStats(times(39, 1000, 1));
  assert.equal(stats.fieldMeanSec, null);
  assert.equal(stats.fieldMedianSec, null);
  assert.equal(stats.fieldFinisherCount, 39);
});

test('computeFieldStats computes mean/median at exactly the threshold', () => {
  const stats = computeFieldStats(times(MIN_FIELD_SIZE, 1000, 1)); // 1000..1039
  assert.equal(stats.fieldFinisherCount, 40);
  assert.equal(stats.fieldMeanSec, 1019.5); // mean of 1000..1039
  assert.equal(stats.fieldMedianSec, 1019.5); // even count -> average of middle two
});

test('computeFieldStats median for an odd-sized field', () => {
  const finishTimes = [1100, 1000, 1200, 1050, 1300, ...times(35, 1400, 1)]; // 40 total, odd path check via 41
  const withOdd = [...finishTimes, 1350];
  const stats = computeFieldStats(withOdd);
  assert.equal(stats.fieldFinisherCount, 41);
  const sorted = [...withOdd].sort((a, b) => a - b);
  assert.equal(stats.fieldMedianSec, sorted[20]);
});

test('computeFieldStats is order-independent (does not mutate or rely on input order)', () => {
  const sortedInput = times(50, 900, 2);
  const shuffled = [...sortedInput].reverse();
  const a = computeFieldStats(sortedInput);
  const b = computeFieldStats(shuffled);
  assert.equal(a.fieldMeanSec, b.fieldMeanSec);
  assert.equal(a.fieldMedianSec, b.fieldMedianSec);
});

test('fieldRatio: below 1.0 means faster than the field average', () => {
  assert.equal(fieldRatio(950, 1000), 0.95);
  assert.equal(fieldRatio(1050, 1000), 1.05);
  assert.equal(fieldRatio(1000, 1000), 1);
});

test('fieldRatio returns null when either input is missing, matching normalizationAvailable: false', () => {
  assert.equal(fieldRatio(null, 1000), null);
  assert.equal(fieldRatio(950, null), null);
  assert.equal(fieldRatio(950, 0), null);
});
