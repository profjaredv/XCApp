const test = require('node:test');
const assert = require('node:assert/strict');
const { markersForRace, segments, splitAnalysis, overallPaceSecPerMile, validateSplitEntries } = require('../lib/splitMath');

// --- markersForRace: every distance in the handoff doc's worked table ---

test('markersForRace: 1 mile has no markers — splits do not apply', () => {
  assert.deepEqual(markersForRace(1609.34, 'MILE'), []);
});

test('markersForRace: 2 mile (3219m) gets Mile 1 only, final segment 1.00mi', () => {
  const markers = markersForRace(3218.68, 'MILE');
  assert.equal(markers.length, 1);
  assert.equal(markers[0].label, 'Mile 1');
});

test('markersForRace: 4K gets Mile 1 and 2', () => {
  const markers = markersForRace(4000, 'MILE');
  assert.deepEqual(markers.map((m) => m.label), ['Mile 1', 'Mile 2']);
});

test('markersForRace: 5K gets Mile 1 and 2 only — not a third marker near the finish', () => {
  const markers = markersForRace(5000, 'MILE');
  assert.deepEqual(markers.map((m) => m.label), ['Mile 1', 'Mile 2']);
});

test('markersForRace: 6K gets Mile 1-3', () => {
  const markers = markersForRace(6000, 'MILE');
  assert.deepEqual(markers.map((m) => m.label), ['Mile 1', 'Mile 2', 'Mile 3']);
});

test('markersForRace: 8K gets Mile 1-4', () => {
  const markers = markersForRace(8000, 'MILE');
  assert.deepEqual(markers.map((m) => m.label), ['Mile 1', 'Mile 2', 'Mile 3', 'Mile 4']);
});

test('markersForRace: 8K in KM scheme is seven markers, labelled 1K-7K', () => {
  const markers = markersForRace(8000, 'KM');
  assert.equal(markers.length, 7);
  assert.deepEqual(markers.map((m) => m.label), ['1K', '2K', '3K', '4K', '5K', '6K', '7K']);
});

test('markersForRace: null scheme defaults to MILE', () => {
  const markers = markersForRace(5000, null);
  assert.deepEqual(markers.map((m) => m.label), ['Mile 1', 'Mile 2']);
});

test('markersForRace: CUSTOM uses the explicit list, sorted, out-of-range values dropped', () => {
  const markers = markersForRace(8000, 'CUSTOM', [4000, 2000, 9000]);
  assert.deepEqual(markers.map((m) => m.markerMeters), [2000, 4000]);
});

// --- segments: the exact doc worked example ---

test('segments: 5K with mile1 5:30, mile2 11:10, finish 17:20 -> closing segment 6:10 over 1.107mi, pace 5:34/mi', () => {
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }, // 5:30
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 670 }, // 11:10
  ];
  const segs = segments(splits, 17 * 60 + 20, 5000);
  assert.equal(segs.length, 3);

  const closing = segs[2];
  assert.equal(closing.isClosing, true);
  assert.equal(Math.round(closing.segmentSec), 370); // 6:10
  assert.ok(Math.abs(closing.distanceMeters - 1781.32) < 0.01);
  // 370s / (1781.32m / 1609.34m/mi) = ~334.3 sec/mi ~= 5:34/mi
  assert.ok(Math.abs(closing.paceSecPerMile - 334) < 2);
});

test('segments: the real Ellensburg Mystic Hammond row (cumulative entry, per the coach)', () => {
  // Mile 1 = 5:02 (302s), M2 Time = 10:06 (606s), Finish = 15:31 (931s).
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 302 },
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 606 },
  ];
  const segs = segments(splits, 931, 5000);
  assert.equal(segs[0].segmentSec, 302); // mile 1
  assert.equal(segs[1].segmentSec, 304); // mile 2 = 606-302 = 5:04, matches the sheet
  // The sheet's "Mile 3" (4:55) is actually a PACE figure — (Finish -
  // M2Time) / 1.1 — not the raw closing segment time (5:25 over the true
  // 1.107mi remaining). Our paceSecPerMile reproduces their number almost
  // exactly, using the real remaining distance instead of their 1.1
  // approximation.
  assert.equal(Math.round(segs[2].segmentSec), 325); // 5:25 raw closing time
  assert.ok(Math.abs(segs[2].paceSecPerMile - 295) <= 2); // ~4:55/mi, matches the sheet
});

test('segments: no splits at all still returns the closing segment for the whole race', () => {
  const segs = segments([], 931, 5000);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].isClosing, true);
  assert.equal(segs[0].distanceMeters, 5000);
});

test('segments: empty when finish or distance is missing', () => {
  assert.deepEqual(segments([{ sequence: 1, markerMeters: 1609.34, elapsedSec: 300 }], null, 5000), []);
  assert.deepEqual(segments([{ sequence: 1, markerMeters: 1609.34, elapsedSec: 300 }], 900, null), []);
});

// --- splitAnalysis ---

test('splitAnalysis: the doc worked example (5:30, 5:40, 5:34-equivalent) is a positive split', () => {
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 },
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 670 },
  ];
  const segs = segments(splits, 17 * 60 + 20, 5000);
  const analysis = splitAnalysis(segs);
  assert.equal(analysis.pattern, 'positive');
  assert.ok(analysis.differentialSec > 0);
});

test('splitAnalysis: even pace across two full-mile segments within 2% reads even', () => {
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }, // 5:30/mi
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 663 }, // 5:33/mi, ~0.9% slower
  ];
  const segs = segments(splits, 990, 5000);
  const analysis = splitAnalysis(segs);
  assert.equal(analysis.pattern, 'even');
});

test('splitAnalysis: negative split when the athlete sped up beyond 2%', () => {
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 340 }, // 5:40/mi
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 670 }, // second mile 5:30/mi
  ];
  const segs = segments(splits, 990, 5000);
  const analysis = splitAnalysis(segs);
  assert.equal(analysis.pattern, 'negative');
});

test('splitAnalysis: null with fewer than two segments', () => {
  assert.equal(splitAnalysis([]), null);
  assert.equal(splitAnalysis([{ sequence: 1, paceSecPerMile: 330, segmentSec: 330, isClosing: true }]), null);
});

// --- validateSplitEntries ---

test('validateSplitEntries: a non-increasing elapsed time is rejected, others still saved', () => {
  const entries = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 },
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 300 }, // earlier than mile 1 — impossible
    { sequence: 3, markerMeters: 4828.02, elapsedSec: 990 },
  ];
  const { validEntries, flags } = validateSplitEntries(entries, { finishSec: 1200, distanceMeters: 5000 });
  assert.equal(validEntries.length, 2);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].sequence, 2);
});

test('validateSplitEntries: elapsed time at or past the finish is rejected', () => {
  const entries = [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 1200 }];
  const { validEntries, flags } = validateSplitEntries(entries, { finishSec: 1200, distanceMeters: 5000 });
  assert.equal(validEntries.length, 0);
  assert.equal(flags[0].reason, 'elapsed time is at or after the finish');
});

test('validateSplitEntries: exactly 0 is rejected (the blank-entry-stored-as-0 bug this replaces)', () => {
  const entries = [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 0 }];
  const { validEntries } = validateSplitEntries(entries, { finishSec: 1200, distanceMeters: 5000 });
  assert.equal(validEntries.length, 0);
});

test('validateSplitEntries: blank rows are simply absent from entries, not represented as 0 — normal and valid', () => {
  const entries = [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }];
  const { validEntries, flags } = validateSplitEntries(entries, { finishSec: 1200, distanceMeters: 5000 });
  assert.equal(validEntries.length, 1);
  assert.equal(flags.length, 0);
});

// --- overallPaceSecPerMile: the "Pace" column the grid should already show ---

test('overallPaceSecPerMile: exactly 1 mile in 300s is 300s/mi', () => {
  assert.equal(overallPaceSecPerMile(300, 1609.34), 300);
});

test('overallPaceSecPerMile: 5K in 15:30 matches Finish/3.1069mi, not the sheet\'s rounded /3.1', () => {
  const pace = overallPaceSecPerMile(930, 5000);
  assert.ok(Math.abs(pace - 930 / (5000 / 1609.34)) < 0.001);
  assert.ok(Math.abs(Math.round(pace) - 299) <= 1);
});

test('overallPaceSecPerMile: null finish or distance returns null, not NaN/Infinity', () => {
  assert.equal(overallPaceSecPerMile(null, 5000), null);
  assert.equal(overallPaceSecPerMile(930, null), null);
  assert.equal(overallPaceSecPerMile(0, 5000), null);
});
