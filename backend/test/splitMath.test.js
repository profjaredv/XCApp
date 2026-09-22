const test = require('node:test');
const assert = require('node:assert/strict');
const { markersForRace, closingSegmentLabel, segments, splitAnalysis, overallPaceSecPerMile, validateSplitEntries, planSplitBatchWrite } = require('../lib/splitMath');

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

// --- closingSegmentLabel: is the tail actually close enough to a whole
// unit to read as "Mile N," or should it just say "Final" ---

test('closingSegmentLabel: 5K reads "Mile 3" — 1.107mi is close enough to a mile', () => {
  const markers = markersForRace(5000, 'MILE');
  assert.equal(closingSegmentLabel(5000, 'MILE', markers), 'Mile 3');
});

test('closingSegmentLabel: 2 mile (3219m) reads "Mile 2" — the classic case, ~1.00mi left', () => {
  const markers = markersForRace(3219, 'MILE');
  assert.equal(closingSegmentLabel(3219, 'MILE', markers), 'Mile 2');
});

test('closingSegmentLabel: 4200m says "Final", not "Mile 3" — only 0.61mi is left after two full miles', () => {
  const markers = markersForRace(4200, 'MILE');
  assert.deepEqual(markers.map((m) => m.label), ['Mile 1', 'Mile 2']);
  assert.equal(closingSegmentLabel(4200, 'MILE', markers), 'Final');
});

test('closingSegmentLabel: 6K also says "Final" — 0.73mi is still short of a mile', () => {
  const markers = markersForRace(6000, 'MILE');
  assert.equal(closingSegmentLabel(6000, 'MILE', markers), 'Final');
});

test('closingSegmentLabel: 8K reads "Mile 5" — 0.97mi clears the tolerance', () => {
  const markers = markersForRace(8000, 'MILE');
  assert.equal(closingSegmentLabel(8000, 'MILE', markers), 'Mile 5');
});

test('closingSegmentLabel: KM scheme reads "NK" the same way, exact multiples never trip the tolerance', () => {
  const markers = markersForRace(8000, 'KM');
  assert.equal(closingSegmentLabel(8000, 'KM', markers), '8K');
});

test('closingSegmentLabel: CUSTOM always says "Final" — no numbered convention to preserve', () => {
  const markers = markersForRace(8000, 'CUSTOM', [2000, 4000]);
  assert.equal(closingSegmentLabel(8000, 'CUSTOM', markers), 'Final');
});

test('closingSegmentLabel: a race with zero full markers still gets a whole-race closing label', () => {
  // markersForRace(1609, ...) returns [] — "splits do not apply" — but
  // segments() still derives one closing segment for the whole distance
  // (see "segments: no splits at all still returns the closing segment
  // for the whole race" below), and that segment deserves a real label
  // too, not null.
  assert.equal(closingSegmentLabel(1609, 'MILE', []), 'Mile 1');
});

test('closingSegmentLabel: null distance or no distance to close returns null, not a throw', () => {
  assert.equal(closingSegmentLabel(0, 'MILE', []), null);
  assert.equal(closingSegmentLabel(null, 'MILE', []), null);
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
//
// Compares the FIRST segment's pace to the LAST segment's pace — and the
// last one, whenever a closing segment exists, IS the closing segment.
// This used to stop at the last FULL mile and treat the closing segment
// as separate/unranked; the coach wants the closing pace itself to be
// what decides positive/negative, not just displayed next to a verdict
// that never looked at it.

test('splitAnalysis: mile1 5:30, mile2 5:40, closing back down to 5:34 — the closer partially recovers, so this reads even, not positive', () => {
  // Before this counted the closing segment: 5:30 vs 5:40 alone read
  // "positive" (3%+ slower). Once the closer (5:34, roughly halfway back
  // between the two) is the actual comparison point, first-to-last is
  // only ~1.3% slower — inside the even threshold.
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 },
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 670 },
  ];
  const segs = segments(splits, 17 * 60 + 20, 5000);
  const analysis = splitAnalysis(segs);
  assert.equal(analysis.pattern, 'even');
});

test('splitAnalysis: two full miles within 2% of each other, but a fast closing kick — now correctly reads negative', () => {
  // The exact bug this fixes: mile1 5:30/mi and mile2 5:33/mi alone would
  // read "even" (under 1% apart), same as the old behavior. But this
  // athlete then closed at ~4:40/mi — a real, sizeable kick that used to
  // be computed, displayed, and then silently ignored by the pattern
  // badge sitting right next to it.
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }, // 5:30/mi
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 663 }, // 5:33/mi
  ];
  const segs = segments(splits, 973, 5000); // closing ~310s over 1.107mi = ~4:40/mi
  const analysis = splitAnalysis(segs);
  assert.equal(analysis.pattern, 'negative');
  assert.ok(analysis.differentialSec < 0);
});

test('splitAnalysis: two full miles within 2% of each other, but a slow closing fade — reads positive', () => {
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }, // 5:30/mi
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 663 }, // 5:33/mi
  ];
  const segs = segments(splits, 1106, 5000); // closing ~443s over 1.107mi = ~6:40/mi
  const analysis = splitAnalysis(segs);
  assert.equal(analysis.pattern, 'positive');
  assert.ok(analysis.differentialSec > 0);
});

test('splitAnalysis: even end to end, including the closing segment, still reads even', () => {
  const splits = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }, // 5:30/mi
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 663 }, // 5:33/mi
  ];
  const segs = segments(splits, 1031, 5000); // closing ~368s over 1.107mi = ~5:32/mi
  const analysis = splitAnalysis(segs);
  assert.equal(analysis.pattern, 'even');
});

test('splitAnalysis: with only one real marker, the comparison is against the closing segment either way — unchanged', () => {
  // A 2-mile race has exactly one full marker; there was never anything
  // else to compare it against, before or after this change.
  const splits = [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 340 }]; // 5:40/mi
  const segs = segments(splits, 990, 3218.68); // closing ~1mi at 650s = 10:50/mi... just needs to differ clearly
  const analysis = splitAnalysis(segs);
  assert.equal(segs.length, 2);
  assert.equal(analysis.pattern, 'positive');
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

// --- planSplitBatchWrite: the concurrent-edit safety this exists for ---
// Two coaches entering different markers for the same athlete around the
// same time must never have one save silently delete or revert the
// other's — see routes/splits.js POST /batch's header comment.

test('planSplitBatchWrite: touching one sequence leaves every other existing sequence completely alone', () => {
  const existing = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 },
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 660 },
  ];
  // Coach B saves marker 3 — has no idea marker 1/2 even exist, doesn't mention them.
  const touched = [{ sequence: 3, markerMeters: 4828.02, elapsedSec: 990 }];
  const { upserts, deletes, finalEntries, flags } = planSplitBatchWrite(existing, touched, { finishSec: 1200, distanceMeters: 5000 });

  assert.equal(deletes.length, 0, 'nothing this save didn\'t mention should ever be deleted');
  assert.deepEqual(upserts.map((u) => u.sequence), [3]);
  assert.equal(flags.length, 0);
  assert.deepEqual(
    finalEntries.map((e) => [e.sequence, e.elapsedSec]).sort(),
    [[1, 330], [2, 660], [3, 990]]
  );
});

test('planSplitBatchWrite: this is exactly the two-coaches-same-athlete case — sequential saves of different markers both survive', () => {
  // Coach A saves marker 1 first.
  const afterA = planSplitBatchWrite([], [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }], { finishSec: 1200, distanceMeters: 5000 });
  assert.deepEqual(afterA.finalEntries.map((e) => e.sequence), [1]);

  // Coach B, whose browser never saw Coach A's save (stale/no-refetch),
  // then saves marker 2 — starting from what's ACTUALLY in the database
  // now (afterA.finalEntries), which is exactly what the route reads
  // fresh on every request rather than trusting either coach's client.
  const afterB = planSplitBatchWrite(afterA.finalEntries, [{ sequence: 2, markerMeters: 3218.68, elapsedSec: 660 }], { finishSec: 1200, distanceMeters: 5000 });

  assert.equal(afterB.deletes.length, 0, 'marker 1, which Coach B never mentioned, must not be deleted');
  assert.deepEqual(
    afterB.finalEntries.map((e) => [e.sequence, e.elapsedSec]).sort(),
    [[1, 330], [2, 660]],
    'both coaches\' markers survive'
  );
});

test('planSplitBatchWrite: elapsedSec null clears exactly that sequence, nothing else', () => {
  const existing = [
    { sequence: 1, markerMeters: 1609.34, elapsedSec: 330 },
    { sequence: 2, markerMeters: 3218.68, elapsedSec: 660 },
  ];
  const { deletes, finalEntries } = planSplitBatchWrite(existing, [{ sequence: 2, markerMeters: 3218.68, elapsedSec: null }], { finishSec: 1200, distanceMeters: 5000 });
  assert.deepEqual(deletes, [2]);
  assert.deepEqual(finalEntries.map((e) => e.sequence), [1]);
});

test('planSplitBatchWrite: a touched-but-invalid sequence is flagged and written nowhere — an existing valid value for it is preserved, not blanked', () => {
  const existing = [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 330 }];
  // Re-entering marker 1 with a bogus (non-increasing relative to itself
  // is moot here, but e.g. mistyped) value that lands at/after the finish.
  const { upserts, deletes, finalEntries, flags } = planSplitBatchWrite(existing, [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 1200 }], { finishSec: 1200, distanceMeters: 5000 });
  assert.equal(upserts.length, 0);
  assert.equal(deletes.length, 0);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].sequence, 1);
  assert.deepEqual(finalEntries, existing, 'the previously-saved value for the touched sequence is untouched by the rejected edit');
});

test('planSplitBatchWrite: a flag on an untouched existing sequence (made inconsistent by this save) is not surfaced and does not block the touched write', () => {
  // Existing marker 2 at 660s. This save edits marker 1 to 700s — later
  // than the existing marker 2, which the merged view would now flag —
  // but marker 2 wasn't touched, so it's left exactly as it was, and the
  // touched marker 1 edit itself still goes through since, taken alone
  // against what came before it (nothing), it's valid.
  const existing = [{ sequence: 2, markerMeters: 3218.68, elapsedSec: 660 }];
  const { upserts, flags, finalEntries } = planSplitBatchWrite(existing, [{ sequence: 1, markerMeters: 1609.34, elapsedSec: 700 }], { finishSec: 1200, distanceMeters: 5000 });
  assert.deepEqual(upserts.map((u) => u.sequence), [1]);
  assert.equal(flags.length, 0, 'sequence 2 is untouched — its own new inconsistency is not this save\'s problem');
  assert.deepEqual(finalEntries.map((e) => [e.sequence, e.elapsedSec]).sort(), [[1, 700], [2, 660]]);
});

test('planSplitBatchWrite: clearing a sequence that was never saved is a no-op, not an error', () => {
  const { deletes, finalEntries } = planSplitBatchWrite([], [{ sequence: 1, markerMeters: 1609.34, elapsedSec: null }], { finishSec: 1200, distanceMeters: 5000 });
  assert.deepEqual(deletes, []);
  assert.deepEqual(finalEntries, []);
});
