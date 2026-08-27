// C10 (LeadPack Master Build Handoff follow-up): "how does this athlete
// typically pace themselves" — averaged across their races at roughly the
// same distance, never mixing a 5K's mile splits in with an 8K's. Pure
// functions only, fed the same per-race segments/analysis/overallPace
// rows routes/splits.js already computes from lib/splitMath.js — nothing
// here re-derives a single split, it only averages what's already there.

// Mirrors web/src/utils/prTracking.ts's normalizeDistance: the same
// common-distance table and 50m tolerance, so "your 5K splits" means the
// same set of races here as it does on the PR badges. Kept as a separate,
// intentionally duplicated table rather than reusing
// lib/athleteJourney.js's computePRs bucketing — that one rounds to the
// nearest *meter* on purpose (a true PR has to be at the precise
// distance), which is a different, stricter question than "which races
// count as roughly a 5K for a splits average."
const COMMON_DISTANCES_METERS = [
  { meters: 1600, label: '1 Mile' },
  { meters: 3000, label: '3K' },
  { meters: 3200, label: '2 Mile' },
  { meters: 5000, label: '5K' },
  { meters: 8000, label: '8K' },
];
const DISTANCE_BUCKET_TOLERANCE_METERS = 50;

function normalizeDistanceMeters(distanceMeters) {
  for (const common of COMMON_DISTANCES_METERS) {
    if (Math.abs(distanceMeters - common.meters) <= DISTANCE_BUCKET_TOLERANCE_METERS) {
      return common.meters;
    }
  }
  return Math.round(distanceMeters);
}

function distanceBucketLabel(bucketMeters) {
  const common = COMMON_DISTANCES_METERS.find((c) => c.meters === bucketMeters);
  if (common) return common.label;
  return `${(bucketMeters / 1609.34).toFixed(1)}mi`;
}

// Ignores anything that isn't a real number and reports how many values it
// actually used. The previous version summed the raw array, so a null was
// coerced to 0 and silently dragged the mean down —
// average([300, null, 320]) returned 206.7, not 310 — and an undefined made
// it NaN. With only two or three races that error is enormous, which is
// exactly the case it was reported in.
// A position's label has to come from the race's own marker scheme —
// hardcoding "Mile N" mislabels a kilometre-marked race's splits.
function segmentLabel(scheme, positionIndex) {
  if (scheme === 'KM') return `${positionIndex + 1}K`;
  if (scheme === 'CUSTOM') return `Split ${positionIndex + 1}`;
  return `Mile ${positionIndex + 1}`;
}

function average(values) {
  const usable = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (usable.length === 0) return { value: null, count: 0 };
  return { value: usable.reduce((sum, v) => sum + v, 0) / usable.length, count: usable.length };
}

// races: [{ raceId, raceName, date, distanceMeters, finishSec, segments,
// analysis, overallPaceSecPerMile }] — exactly what routes/splits.js's
// GET /athlete/:athleteId rows already look like. Only races with at
// least one real (non-closing) segment count toward a bucket — a race
// with no splits entered has nothing to average in.
function aggregateSplitsByDistance(races) {
  const byBucket = new Map();

  for (const r of races) {
    if (r.distanceMeters == null || !Array.isArray(r.segments) || r.segments.length === 0) continue;
    const realSegments = r.segments.filter((s) => !s.isClosing).sort((a, b) => a.sequence - b.sequence);
    const closingSegment = r.segments.find((s) => s.isClosing) ?? null;
    if (realSegments.length === 0 && !closingSegment) continue;

    // Bucket by distance AND marker scheme. Two 5Ks can legitimately be
    // marked differently (splitMarkerScheme is per-race and nullable), and
    // positionally averaging them compares a ~1609m mile split against a
    // 1000m kilometre split — then labels the result "Mile 1". Same
    // distance is not the same thing as comparable segments.
    const bucketMeters = normalizeDistanceMeters(r.distanceMeters);
    const scheme = r.splitMarkerScheme || 'MILE';
    const key = `${bucketMeters}|${scheme}`;
    if (!byBucket.has(key)) byBucket.set(key, { bucketMeters, scheme, races: [] });
    byBucket.get(key).races.push({ ...r, realSegments, closingSegment });
  }

  const result = [];
  for (const { bucketMeters, scheme, races } of byBucket.values()) {
    const maxPositions = Math.max(...races.map((r) => r.realSegments.length));
    const segmentAverages = [];
    for (let position = 0; position < maxPositions; position += 1) {
      const atPosition = races.map((r) => r.realSegments[position]).filter((s) => s != null);
      if (atPosition.length === 0) continue;
      const segAvg = average(atPosition.map((s) => s.segmentSec));
      const paceAvg = average(atPosition.map((s) => s.paceSecPerMile));
      segmentAverages.push({
        position: position + 1,
        label: segmentLabel(scheme, position),
        avgSegmentSec: segAvg.value,
        avgPaceSecPerMile: paceAvg.value,
        // How many races this position covers, and separately how many of
        // them actually produced a pace. These differ whenever a segment
        // has no usable distance, and reporting only the first overstated
        // what the pace average was built from.
        raceCount: atPosition.length,
        segmentRaceCount: segAvg.count,
        paceRaceCount: paceAvg.count,
      });
    }

    const closingSegments = races.map((r) => r.closingSegment).filter((s) => s != null);
    const closingSegAvg = average(closingSegments.map((s) => s.segmentSec));
    const closingPaceAvg = average(closingSegments.map((s) => s.paceSecPerMile));
    const closingAverage =
      closingSegments.length > 0
        ? {
            avgSegmentSec: closingSegAvg.value,
            avgPaceSecPerMile: closingPaceAvg.value,
            raceCount: closingSegments.length,
            segmentRaceCount: closingSegAvg.count,
            paceRaceCount: closingPaceAvg.count,
          }
        : null;

    const overallPaces = races.map((r) => r.overallPaceSecPerMile).filter((p) => p != null);

    const patternCounts = { negative: 0, even: 0, positive: 0 };
    for (const r of races) {
      if (r.analysis?.pattern) patternCounts[r.analysis.pattern] += 1;
    }
    const patternTotal = patternCounts.negative + patternCounts.even + patternCounts.positive;
    let predominantPattern = null;
    if (patternTotal > 0) {
      const max = Math.max(patternCounts.negative, patternCounts.even, patternCounts.positive);
      const leaders = Object.entries(patternCounts).filter(([, count]) => count === max);
      predominantPattern = leaders.length === 1 ? leaders[0][0] : 'mixed';
    }

    result.push({
      distanceBucketMeters: bucketMeters,
      distanceLabel: distanceBucketLabel(bucketMeters),
      markerScheme: scheme,
      raceCount: races.length,
      segmentAverages,
      closingAverage,
      overallAveragePaceSecPerMile: average(overallPaces).value,
      pattern: { predominant: predominantPattern, counts: patternCounts },
    });
  }

  return result.sort((a, b) => a.distanceBucketMeters - b.distanceBucketMeters);
}

module.exports = {
  COMMON_DISTANCES_METERS,
  DISTANCE_BUCKET_TOLERANCE_METERS,
  normalizeDistanceMeters,
  distanceBucketLabel,
  segmentLabel,
  aggregateSplitsByDistance,
};
