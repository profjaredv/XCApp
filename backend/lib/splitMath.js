// C4 (LeadPack Master Build Handoff): one implementation of split-marker
// generation, segment derivation, and split-pattern classification —
// imported by routes/splits.js and the frontend's entry grid, never
// duplicated. Pure functions only, no Prisma.
//
// Confirmed against the coach's own working spreadsheet (Ellensburg
// 10/23/25): a coach types the CUMULATIVE elapsed time they read off the
// clock at each marker — "M2 Time" in their sheet — never a segment
// duration. Segment times, the closing-segment-to-finish, and pace are
// all derived here and never stored. Their sheet's "Mile 3" column and
// "Pace" column are themselves just this exact math done by hand in Excel
// (confirmed: (Finish - M2Time) / 1.1 for the closing-segment pace-
// equivalent, Finish / 3.1 for overall pace) — this module does the same
// arithmetic, just with the real remaining distance (1.107mi for a 5K)
// instead of their spreadsheet's rounded 1.1.

const { MILE_IN_METERS } = require('./distance');
const { paceSecPerMile } = require('./groupAnalytics');

const KM_IN_METERS = 1000;
// The 400m guard prevents a marker sitting nearly on the finish line —
// without it a 5K would place a "Mile 3" marker 172m before the tape,
// which is not a video anyone needs to review separately.
const MARKER_FINISH_GUARD_METERS = 400;
// pattern is 'even' when the comparison paces are within this fraction of
// each other.
const EVEN_SPLIT_THRESHOLD = 0.02;

function formatMetersLabel(markerMeters) {
  if (Math.abs(markerMeters % KM_IN_METERS) < 1) {
    return `${Math.round(markerMeters / KM_IN_METERS)}K`;
  }
  const miles = markerMeters / MILE_IN_METERS;
  if (Math.abs(miles - Math.round(miles)) < 0.01) {
    const wholeMiles = Math.round(miles);
    return `${wholeMiles} Mile${wholeMiles === 1 ? '' : 's'}`;
  }
  return `${Math.round(markerMeters)}m`;
}

// scheme: 'MILE' | 'KM' | 'CUSTOM' | null (null defaults to MILE — correct
// for every race this program runs, so the common case needs no
// interaction). Returns [] when no marker fits (e.g. a 1 mile race —
// "splits do not apply").
function markersForRace(distanceMeters, scheme, customMarkersMeters) {
  if (!(distanceMeters > 0)) return [];
  const resolvedScheme = scheme || 'MILE';

  if (resolvedScheme === 'CUSTOM') {
    const markers = Array.isArray(customMarkersMeters) ? customMarkersMeters : [];
    return [...markers]
      .filter((m) => m > 0 && m < distanceMeters)
      .sort((a, b) => a - b)
      .map((markerMeters, i) => ({ sequence: i + 1, markerMeters, label: formatMetersLabel(markerMeters) }));
  }

  const unit = resolvedScheme === 'KM' ? KM_IN_METERS : MILE_IN_METERS;
  const guard = distanceMeters - MARKER_FINISH_GUARD_METERS;
  const markers = [];
  for (let multiple = 1; unit * multiple < guard; multiple += 1) {
    markers.push(unit * multiple);
  }
  return markers.map((markerMeters, i) => ({
    sequence: i + 1,
    markerMeters,
    label: resolvedScheme === 'KM' ? `${i + 1}K` : `Mile ${i + 1}`,
  }));
}

// How close the closing segment's own distance needs to be to a whole
// unit (mile, or km) before it reads naturally as "the next Mile N"/"NK"
// the way a coach's own sheet already treats a 5K's 1.107mi closer (see
// this file's header comment). Below this, calling it "Mile N" overstates
// it: a 4200m race has two full mile markers and only 0.61mi left after
// them — that is not "basically a mile," and labelling it one misleads a
// coach who expects Mile-N paces to be roughly comparable in length. The
// tolerance only needs a floor: markersForRace's own 400m finish guard
// already caps how much longer than one unit the closing segment can
// ever be (at most unit + 400m, ~1.25mi for MILE), so nothing here can
// run away too far in the other direction.
const CLOSING_LABEL_MIN_UNIT_FRACTION = 0.8;

// markers: markersForRace's own output for this race, so the numbering
// ("Mile 3" for a race with 2 full mile markers) always matches what's
// actually on screen. Returns null when there's no distance to work with.
function closingSegmentLabel(distanceMeters, scheme, markers) {
  if (!(distanceMeters > 0)) return null;
  const resolvedScheme = scheme || 'MILE';
  if (resolvedScheme === 'CUSTOM') return 'Final';

  const lastMarkerMeters = markers.length > 0 ? markers[markers.length - 1].markerMeters : 0;
  const closingMeters = distanceMeters - lastMarkerMeters;
  if (!(closingMeters > 0)) return null;

  const unit = resolvedScheme === 'KM' ? KM_IN_METERS : MILE_IN_METERS;
  if (closingMeters / unit < CLOSING_LABEL_MIN_UNIT_FRACTION) return 'Final';

  return resolvedScheme === 'KM' ? `${markers.length + 1}K` : `Mile ${markers.length + 1}`;
}

// splits: [{ sequence, markerMeters, elapsedSec }] for one result, cumulative
// from the gun. finishSec/distanceMeters come from the Result/Race rows —
// the app already has them, so the closing segment (last marker to the
// tape) is always derived, never entered. Its distance is the ACTUAL
// remainder (e.g. 5000 - 3218.68 = 1781.32m = 1.107mi for a 5K), not one
// mile — dividing by 1 there is the exact bug this replaces
// (web/src/types/splits.ts's old twoMileTime-based math).
//
// Returns segments in order, each flagged isClosing so callers (like
// splitAnalysis below) can tell a real, full marker-to-marker segment
// apart from the derived closing one.
function segments(splits, finishSec, distanceMeters) {
  if (!(finishSec > 0) || !(distanceMeters > 0)) return [];

  const sorted = [...(splits || [])]
    .filter((s) => s && s.elapsedSec != null && s.markerMeters != null)
    .sort((a, b) => a.sequence - b.sequence);

  const result = [];
  let prevMeters = 0;
  let prevSec = 0;

  for (const s of sorted) {
    const segMeters = s.markerMeters - prevMeters;
    const segSec = s.elapsedSec - prevSec;
    if (segMeters > 0 && segSec > 0) {
      result.push({
        sequence: s.sequence,
        fromMeters: prevMeters,
        toMeters: s.markerMeters,
        distanceMeters: segMeters,
        segmentSec: segSec,
        paceSecPerMile: paceSecPerMile(segSec, segMeters),
        isClosing: false,
      });
    }
    prevMeters = s.markerMeters;
    prevSec = s.elapsedSec;
  }

  const closingMeters = distanceMeters - prevMeters;
  const closingSec = finishSec - prevSec;
  if (closingMeters > 0 && closingSec > 0) {
    result.push({
      sequence: sorted.length + 1,
      fromMeters: prevMeters,
      toMeters: distanceMeters,
      distanceMeters: closingMeters,
      segmentSec: closingSec,
      paceSecPerMile: paceSecPerMile(closingSec, closingMeters),
      isClosing: true,
    });
  }

  return result;
}

// segs: output of segments() above. Compares PACE, not raw segment time —
// pace already accounts for a segment's own length, which is exactly why
// the derived closing segment (never a full mile) belongs in this
// comparison on the same footing as every other segment: there's no
// length unfairness left for excluding it to correct for. This used to
// compare only the full, equal-length marker segments and report the
// closing segment separately, on the theory that a full-mile-vs-full-mile
// comparison was the fairer one — but once the comparison is pace, not
// raw time, that theory doesn't hold: a fast or slow closing kick is real
// pacing information, and hiding it from positive/negative meant a coach
// could see a fast "Mile 3" pace sitting right next to an "Even split"
// badge that never looked at it. So: first segment's pace vs the LAST
// segment's pace, whichever segment that is — the closing one, whenever
// one exists.
function splitAnalysis(segs) {
  if (!Array.isArray(segs) || segs.length < 2) return null;

  const withPace = segs.filter((s) => s.paceSecPerMile != null);
  if (withPace.length < 2) return null;

  const firstPace = withPace[0].paceSecPerMile;
  const lastPace = withPace[withPace.length - 1].paceSecPerMile;
  const differentialSec = lastPace - firstPace;

  let pattern;
  if (Math.abs(differentialSec) / firstPace <= EVEN_SPLIT_THRESHOLD) {
    pattern = 'even';
  } else if (differentialSec < 0) {
    pattern = 'negative';
  } else {
    pattern = 'positive';
  }

  const mid = Math.max(1, Math.floor(segs.length / 2));
  const firstHalfSec = segs.slice(0, mid).reduce((sum, s) => sum + s.segmentSec, 0);
  const secondHalfSec = segs.slice(mid).reduce((sum, s) => sum + s.segmentSec, 0);

  return {
    firstHalfSec,
    secondHalfSec,
    differentialSec,
    pattern,
    segmentPaces: withPace.map((s) => s.paceSecPerMile),
  };
}

// The whole-race pace a coach expects to just be there next to the
// splits, not something they compute by hand — finish time over the
// race's actual full distance, not the segment-boundary math above.
function overallPaceSecPerMile(finishSec, distanceMeters) {
  if (!(finishSec > 0) || !(distanceMeters > 0)) return null;
  return paceSecPerMile(finishSec, distanceMeters);
}

// entries: [{ sequence, markerMeters, elapsedSec }] for one athlete, as
// typed into the entry grid or parsed from a CSV. Validation warns, it
// does not block — invalid rows are dropped with a reason and the rest are
// still saved. A hard block on row 34 of 40 loses the other 39.
function validateSplitEntries(entries, { finishSec, distanceMeters } = {}) {
  const sorted = [...(entries || [])].sort((a, b) => a.sequence - b.sequence);
  const validEntries = [];
  const flags = [];
  let prevElapsed = 0;
  let prevMarker = 0;

  for (const e of sorted) {
    if (e.elapsedSec === 0) {
      flags.push({ sequence: e.sequence, reason: 'zero elapsed time rejected' });
      continue;
    }
    if (!(e.elapsedSec > prevElapsed)) {
      flags.push({ sequence: e.sequence, reason: 'elapsed time did not increase from the previous marker' });
      continue;
    }
    if (finishSec != null && !(e.elapsedSec < finishSec)) {
      flags.push({ sequence: e.sequence, reason: 'elapsed time is at or after the finish' });
      continue;
    }
    if (!(e.markerMeters > prevMarker) || (distanceMeters != null && !(e.markerMeters < distanceMeters))) {
      flags.push({ sequence: e.sequence, reason: 'marker distance is invalid for this race' });
      continue;
    }
    validEntries.push(e);
    prevElapsed = e.elapsedSec;
    prevMarker = e.markerMeters;
  }

  return { validEntries, flags };
}

// Decides what one athlete's split save should actually write, without
// touching the database — pulled out of routes/splits.js's POST /batch so
// the merge-and-validate decision (the part concurrent-edit safety
// depends on) is directly testable, same as validateSplitEntries above.
//
// existingEntries: this resultId's currently-saved splits, read fresh in
// the same request — [{ sequence, markerMeters, elapsedSec }].
// touchedEntries: only the sequences THIS save is actually changing —
// [{ sequence, markerMeters, elapsedSec }], elapsedSec null meaning
// "clear this one." Anything not in touchedEntries is left alone: not
// re-validated, not re-written, not deleted — a stale client snapshot of
// the rest of the row (or another coach's concurrent edit to a different
// marker) can never be clobbered by this save, because this save never
// expresses an opinion about sequences it doesn't mention.
//
// Returns { upserts, deletes, finalEntries, flags }:
//   upserts/deletes describe exactly what to write (or nothing, for a
//   touched-but-invalid sequence — an invalid edit never overwrites a
//   previously-valid saved value). finalEntries is the full row's state
//   after this write, for the caller to derive segments/analysis/response
//   from without a second read. flags covers only touched sequences.
function planSplitBatchWrite(existingEntries, touchedEntries, { finishSec, distanceMeters } = {}) {
  const existingBySequence = new Map((existingEntries || []).map((e) => [e.sequence, e]));
  const touched = touchedEntries || [];
  const touchedSequences = new Set(touched.map((e) => e.sequence));
  const clearedSequences = new Set(touched.filter((e) => e.elapsedSec == null).map((e) => e.sequence));

  // Merged view = existing rows with touched sequences overlaid — used
  // only to run validateSplitEntries with full monotonicity context, never
  // written back as-is.
  const merged = new Map(existingBySequence);
  for (const e of touched) {
    if (clearedSequences.has(e.sequence)) merged.delete(e.sequence);
    else merged.set(e.sequence, e);
  }

  const { validEntries, flags: allFlags } = validateSplitEntries([...merged.values()], { finishSec, distanceMeters });
  const flags = allFlags.filter((f) => touchedSequences.has(f.sequence));
  const validTouchedBySequence = new Map(validEntries.filter((e) => touchedSequences.has(e.sequence)).map((e) => [e.sequence, e]));

  const upserts = [];
  const deletes = [...clearedSequences].filter((sequence) => existingBySequence.has(sequence));

  const finalBySequence = new Map(existingBySequence);
  for (const sequence of clearedSequences) finalBySequence.delete(sequence);
  for (const sequence of touchedSequences) {
    if (clearedSequences.has(sequence)) continue;
    const valid = validTouchedBySequence.get(sequence);
    if (!valid) continue; // touched but invalid — existing value (if any) is left as-is
    upserts.push(valid);
    finalBySequence.set(sequence, valid);
  }

  return { upserts, deletes, finalEntries: [...finalBySequence.values()], flags };
}

module.exports = {
  MARKER_FINISH_GUARD_METERS,
  EVEN_SPLIT_THRESHOLD,
  formatMetersLabel,
  markersForRace,
  closingSegmentLabel,
  segments,
  splitAnalysis,
  overallPaceSecPerMile,
  validateSplitEntries,
  planSplitBatchWrite,
};
