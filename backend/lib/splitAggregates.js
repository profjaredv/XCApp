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

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
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

    const bucketMeters = normalizeDistanceMeters(r.distanceMeters);
    if (!byBucket.has(bucketMeters)) byBucket.set(bucketMeters, []);
    byBucket.get(bucketMeters).push({ ...r, realSegments, closingSegment });
  }

  const result = [];
  for (const [bucketMeters, races] of byBucket) {
    const maxPositions = Math.max(...races.map((r) => r.realSegments.length));
    const segmentAverages = [];
    for (let position = 0; position < maxPositions; position += 1) {
      const atPosition = races.map((r) => r.realSegments[position]).filter((s) => s != null);
      if (atPosition.length === 0) continue;
      segmentAverages.push({
        position: position + 1,
        label: `Mile ${position + 1}`,
        avgSegmentSec: average(atPosition.map((s) => s.segmentSec)),
        avgPaceSecPerMile: average(atPosition.map((s) => s.paceSecPerMile).filter((p) => p != null)),
        raceCount: atPosition.length,
      });
    }

    const closingSegments = races.map((r) => r.closingSegment).filter((s) => s != null);
    const closingAverage =
      closingSegments.length > 0
        ? {
            avgSegmentSec: average(closingSegments.map((s) => s.segmentSec)),
            avgPaceSecPerMile: average(closingSegments.map((s) => s.paceSecPerMile).filter((p) => p != null)),
            raceCount: closingSegments.length,
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
      raceCount: races.length,
      segmentAverages,
      closingAverage,
      overallAveragePaceSecPerMile: average(overallPaces),
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
  aggregateSplitsByDistance,
};
