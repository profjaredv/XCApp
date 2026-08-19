const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDistanceMeters,
  distanceBucketLabel,
  aggregateSplitsByDistance,
} = require('../lib/splitAggregates');

test('normalizeDistanceMeters: snaps within 50m of a common distance', () => {
  assert.equal(normalizeDistanceMeters(5000), 5000);
  assert.equal(normalizeDistanceMeters(5023), 5000);
  assert.equal(normalizeDistanceMeters(4980), 5000);
});

test('normalizeDistanceMeters: outside tolerance of every common distance keeps its own rounded bucket', () => {
  assert.equal(normalizeDistanceMeters(4000), 4000);
});

test('distanceBucketLabel: known bucket gets its name, unknown gets a mile figure', () => {
  assert.equal(distanceBucketLabel(5000), '5K');
  assert.equal(distanceBucketLabel(4000), (4000 / 1609.34).toFixed(1) + 'mi');
});

const raceA = {
  raceId: 'A',
  raceName: 'Meet A',
  date: '2025-09-01',
  distanceMeters: 5000,
  segments: [
    { sequence: 1, segmentSec: 300, paceSecPerMile: 300, isClosing: false },
    { sequence: 2, segmentSec: 310, paceSecPerMile: 310, isClosing: false },
    { sequence: 3, segmentSec: 320, paceSecPerMile: 330, isClosing: true },
  ],
  analysis: { pattern: 'positive' },
  overallPaceSecPerMile: 305,
};
const raceB = {
  raceId: 'B',
  raceName: 'Meet B',
  date: '2025-09-15',
  distanceMeters: 5020, // within the 50m tolerance of 5000 — same bucket as raceA
  segments: [
    { sequence: 1, segmentSec: 290, paceSecPerMile: 290, isClosing: false },
    { sequence: 2, segmentSec: 280, paceSecPerMile: 280, isClosing: false },
    { sequence: 3, segmentSec: 260, paceSecPerMile: 270, isClosing: true },
  ],
  analysis: { pattern: 'negative' },
  overallPaceSecPerMile: 285,
};
const raceC = {
  raceId: 'C',
  raceName: 'Meet C',
  date: '2025-10-01',
  distanceMeters: 8000, // a different bucket — never averaged in with the 5Ks
  segments: [
    { sequence: 1, segmentSec: 300, paceSecPerMile: 300, isClosing: false },
    { sequence: 2, segmentSec: 305, paceSecPerMile: 305, isClosing: false },
    { sequence: 3, segmentSec: 310, paceSecPerMile: 310, isClosing: false },
    { sequence: 4, segmentSec: 200, paceSecPerMile: 320, isClosing: true },
  ],
  analysis: { pattern: 'positive' },
  overallPaceSecPerMile: 305,
};
const raceNoSplits = {
  raceId: 'D',
  raceName: 'Meet D',
  date: '2025-10-15',
  distanceMeters: 5000,
  segments: [],
  analysis: null,
  overallPaceSecPerMile: 300,
};

test('aggregateSplitsByDistance: buckets by normalized distance, never mixing a 5K with an 8K', () => {
  const result = aggregateSplitsByDistance([raceA, raceB, raceC, raceNoSplits]);
  assert.equal(result.length, 2);
  assert.equal(result[0].distanceBucketMeters, 5000);
  assert.equal(result[1].distanceBucketMeters, 8000);
});

test('aggregateSplitsByDistance: a race with no splits entered contributes nothing, not a spurious bucket entry', () => {
  const result = aggregateSplitsByDistance([raceA, raceNoSplits]);
  const bucket5k = result.find((r) => r.distanceBucketMeters === 5000);
  assert.equal(bucket5k.raceCount, 1);
});

test('aggregateSplitsByDistance: averages segment position, closing segment, and overall pace correctly', () => {
  const result = aggregateSplitsByDistance([raceA, raceB]);
  const bucket = result.find((r) => r.distanceBucketMeters === 5000);
  assert.equal(bucket.raceCount, 2);
  assert.equal(bucket.segmentAverages.length, 2);
  assert.equal(bucket.segmentAverages[0].label, 'Mile 1');
  assert.equal(bucket.segmentAverages[0].avgSegmentSec, 295); // (300+290)/2
  assert.equal(bucket.segmentAverages[1].avgSegmentSec, 295); // (310+280)/2
  assert.equal(bucket.closingAverage.avgSegmentSec, 290); // (320+260)/2
  assert.equal(bucket.closingAverage.avgPaceSecPerMile, 300); // (330+270)/2
  assert.equal(bucket.overallAveragePaceSecPerMile, 295); // (305+285)/2
});

test('aggregateSplitsByDistance: an exact pattern tie is reported as mixed, not guessed', () => {
  const result = aggregateSplitsByDistance([raceA, raceB]); // positive vs negative, 1-1 tie
  const bucket = result.find((r) => r.distanceBucketMeters === 5000);
  assert.equal(bucket.pattern.predominant, 'mixed');
  assert.deepEqual(bucket.pattern.counts, { negative: 1, even: 0, positive: 1 });
});

test('aggregateSplitsByDistance: a clear majority pattern wins', () => {
  const result = aggregateSplitsByDistance([raceC]);
  const bucket = result.find((r) => r.distanceBucketMeters === 8000);
  assert.equal(bucket.pattern.predominant, 'positive');
  assert.equal(bucket.raceCount, 1);
  assert.equal(bucket.segmentAverages.length, 3);
});

test('aggregateSplitsByDistance: races with differing marker counts at the same distance still align by position', () => {
  const shortRace = {
    raceId: 'E',
    raceName: 'Meet E',
    date: '2025-09-20',
    distanceMeters: 5000,
    segments: [{ sequence: 1, segmentSec: 300, paceSecPerMile: 300, isClosing: true }],
    analysis: null,
    overallPaceSecPerMile: 300,
  };
  const result = aggregateSplitsByDistance([raceA, shortRace]);
  const bucket = result.find((r) => r.distanceBucketMeters === 5000);
  // raceA has 2 real segments, shortRace has 0 (its only segment is closing) —
  // position 1 only averages across the race that actually has one.
  assert.equal(bucket.segmentAverages.length, 2);
  assert.equal(bucket.segmentAverages[0].raceCount, 1);
  assert.equal(bucket.segmentAverages[0].avgSegmentSec, 300);
  assert.equal(bucket.closingAverage.raceCount, 2);
});
