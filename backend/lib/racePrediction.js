// Race prediction: project an athlete's next race from their course-
// adjusted pace trend this season, the target race's own course-difficulty
// rating when known, their own recent split shape, and (once they have a
// track record) their own historical prediction error. Pure functions
// only, no Prisma — same split as lib/courseDifficulty.js and
// lib/splitMath.js, which this builds directly on top of.
//
// The pieces, in the order a caller actually uses them:
//   1. projectSeasonFitness  — this season's adjusted-pace trend, extrapolated to race day.
//   2. (caller adds back courseDifficultySecPerMile from lib/courseDifficulty.js, when known)
//   3. computeBiasAndMargin  — this athlete's own past prediction error, if any.
//   4. buildRacePrediction   — combines 1-3 into one predicted pace/time.
//   5. buildSplitShape + applySplitShape — turns the single predicted time
//      into a predicted split profile, using how this athlete actually
//      tends to pace a race rather than assuming even splits.
//   6. scorePrediction       — once the real result lands, how wrong was it.

const { MILE_IN_METERS } = require('./distance');
const { paceSecPerMile } = require('./groupAnalytics');

// A defensive floor only — not a realistic pace. Extrapolating a linear
// trend far past the data it was fit on (sparse history, a target race
// weeks after the last one) can in principle cross zero; nothing about a
// negative or zero pace is meaningful, so this just keeps the arithmetic
// from producing nonsense rather than asserting any real minimum speed.
const MIN_SANE_PACE_SEC_PER_MILE = 1;

// points: [{ x: number, y: number }], x in any consistent unit (days, here).
// Ordinary least squares. Returns null when there isn't enough variation
// in x to fit a line (0-1 points, or every point on the same x) — the
// caller's job to fall back to a flat baseline, not this function's to
// guess a slope of 0 and call it a fit.
function fitLinearTrend(points) {
  const n = points.length;
  if (n < 2) return null;

  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - meanX) * (p.y - meanY);
    denominator += (p.x - meanX) * (p.x - meanX);
  }
  if (denominator === 0) return null; // every point at the same x

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// history: [{ date: Date, adjustedPaceSecPerMile: number }] — one athlete,
// one season, already filtered to races whose adjusted pace could be
// computed (see lib/courseDifficulty.js's computeSeasonAdjustedPaces).
// Adjusted paces are only comparable WITHIN a season (that function's own
// header explains why — each season's "zero" is that season's own average
// course), so a caller must never mix seasons into one history array.
//
// targetDate: the date of the race being predicted.
//
// Returns null with zero history (nothing to project from — the caller's
// cue to say "not enough data" rather than guess). With exactly one race,
// returns that race's own adjusted pace as a flat baseline (no trend to
// fit from a single point, so basedOnRaceCount: 1 flags that this
// prediction carries no fitness-trend signal, just last-known fitness).
// With two or more, fits a line through date vs. adjusted pace and
// extrapolates to targetDate — "normal fitness improvement" showing up as
// a negative slope (getting faster), though a positive slope (a real
// decline) is reported just as honestly.
function projectSeasonFitness(history, targetDate) {
  const sorted = [...history].sort((a, b) => a.date - b.date);
  if (sorted.length === 0) return null;

  if (sorted.length === 1) {
    return {
      trendPaceSecPerMile: sorted[0].adjustedPaceSecPerMile,
      slopeSecPerMilePerDay: 0,
      basedOnRaceCount: 1,
    };
  }

  const originDate = sorted[0].date;
  const points = sorted.map((h) => ({
    x: (h.date - originDate) / MS_PER_DAY,
    y: h.adjustedPaceSecPerMile,
  }));

  const fit = fitLinearTrend(points);
  if (!fit) {
    // Every race on the same calendar day (a doubleheader) — nothing to
    // extrapolate; fall back to their average that day, same spirit as
    // the single-race case.
    const avg = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return { trendPaceSecPerMile: avg, slopeSecPerMilePerDay: 0, basedOnRaceCount: sorted.length };
  }

  const targetX = (targetDate - originDate) / MS_PER_DAY;
  const trendPaceSecPerMile = fit.intercept + fit.slope * targetX;
  return { trendPaceSecPerMile, slopeSecPerMilePerDay: fit.slope, basedOnRaceCount: sorted.length };
}

// errors: number[] — this athlete's own past errorSecPerMile values
// (actual - predicted) from previously SCORED predictions, oldest or
// newest first, doesn't matter (unweighted). Returns nulls with no history
// to learn from yet; margin needs at least 2 points to describe a spread
// (with exactly 1, the bias IS the whole observation — nothing left over
// to call a margin around it).
function computeBiasAndMargin(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return { biasSecPerMile: null, marginSecPerMile: null };
  }

  const biasSecPerMile = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  if (errors.length < 2) {
    return { biasSecPerMile, marginSecPerMile: null };
  }

  const variance = errors.reduce((sum, e) => sum + (e - biasSecPerMile) ** 2, 0) / errors.length;
  return { biasSecPerMile, marginSecPerMile: Math.sqrt(variance) };
}

// referenceSegments: lib/splitMath.js's segments() output for ONE race —
// the most recent race this athlete has real splits for. referenceDistanceMeters
// is that SAME race's distance (segments' own fromMeters/toMeters are already
// in those terms). referenceOverallPaceSecPerMile is that race's overall pace.
//
// Returns [{ fromFraction, toFraction, ratio }] — ratio is that segment's
// pace relative to the race's overall pace, so "ran the last mile 4% slower
// than their average for the day" survives being applied to a different
// race's own distance. Null when there's nothing to shape from (fewer than
// 2 segments — splitMath.splitAnalysis uses the same floor — or no overall
// pace to compare against), the signal for a caller to fall back to even
// pacing rather than fabricate a shape from one data point.
function buildSplitShape(referenceSegments, referenceOverallPaceSecPerMile, referenceDistanceMeters) {
  if (!Array.isArray(referenceSegments) || referenceSegments.length < 2) return null;
  if (!(referenceOverallPaceSecPerMile > 0) || !(referenceDistanceMeters > 0)) return null;

  const withPace = referenceSegments.filter((s) => s.paceSecPerMile != null);
  if (withPace.length < 2) return null;

  return withPace.map((s) => ({
    fromFraction: s.fromMeters / referenceDistanceMeters,
    toFraction: s.toMeters / referenceDistanceMeters,
    ratio: s.paceSecPerMile / referenceOverallPaceSecPerMile,
  }));
}

// The ratio for whatever shape segment covers (or is nearest to) this
// fraction of the race. Falls back to the nearest edge segment rather than
// null — a target race slightly longer/shorter than the reference one
// (different meet, same athlete) still gets a reasonable shape instead of
// an unexplained gap at the ends.
function ratioAtFraction(shape, fraction) {
  for (const seg of shape) {
    if (fraction <= seg.toFraction + 1e-9) return seg.ratio;
  }
  return shape[shape.length - 1].ratio;
}

// markers: lib/splitMath.js's markersForRace() output for the TARGET
// race's own distance/scheme. shape: buildSplitShape()'s output, or null
// (even pacing — every segment's ratio is implicitly 1).
//
// Returns [{ sequence, markerMeters, label, predictedElapsedSec }] for
// every marker, plus one final entry (sequence = markers.length + 1,
// markerMeters = distanceMeters, label from closingSegmentLabel) for the
// finish — predictedElapsedSec there always equals the overall predicted
// time exactly, by construction (the segments' predicted times are built
// to sum to it).
function applySplitShape(predictedPaceSecPerMile, distanceMeters, markers, shape, closingLabel) {
  const boundaries = [...markers.map((m) => m.markerMeters), distanceMeters];
  const labels = [...markers.map((m) => m.label), closingLabel || 'Final'];

  let prevMeters = 0;
  let elapsedSec = 0;
  const out = [];

  for (let i = 0; i < boundaries.length; i++) {
    const toMeters = boundaries[i];
    const segMeters = toMeters - prevMeters;
    if (segMeters > 0) {
      const midFraction = (prevMeters + toMeters / 2) / distanceMeters;
      const ratio = shape ? ratioAtFraction(shape, midFraction) : 1;
      const segPaceSecPerMile = predictedPaceSecPerMile * ratio;
      elapsedSec += segPaceSecPerMile * (segMeters / MILE_IN_METERS);
    }
    out.push({ sequence: i + 1, markerMeters: toMeters, label: labels[i], predictedElapsedSec: elapsedSec });
    prevMeters = toMeters;
  }

  return out;
}

// Combines a fitness trend, a course adjustment, and a learned bias into
// one prediction. `trend` must be non-null (callers check
// projectSeasonFitness's result first and report "not enough data"
// instead of calling this with nothing to build from).
// `courseDifficultySecPerMile` null means this course has no rated history
// for this team yet — the trend is used unadjusted, and that's recorded
// as-is (null, not 0) so the caller/UI can say so rather than imply a
// calibration that didn't happen.
function buildRacePrediction({
  trend,
  courseDifficultySecPerMile,
  bias,
  distanceMeters,
  markers,
  splitShape,
  closingLabel,
}) {
  const rawPredictedPace = trend.trendPaceSecPerMile + (courseDifficultySecPerMile ?? 0);
  const biasAppliedSecPerMile = bias?.biasSecPerMile ?? null;
  const predictedPaceSecPerMile = Math.max(
    rawPredictedPace + (biasAppliedSecPerMile ?? 0),
    MIN_SANE_PACE_SEC_PER_MILE
  );
  const predictedTimeSec = predictedPaceSecPerMile * (distanceMeters / MILE_IN_METERS);

  return {
    predictedPaceSecPerMile,
    predictedTimeSec,
    trendPaceSecPerMile: trend.trendPaceSecPerMile,
    courseDifficultySecPerMile: courseDifficultySecPerMile ?? null,
    basedOnRaceCount: trend.basedOnRaceCount,
    biasAppliedSecPerMile,
    marginSecPerMile: bias?.marginSecPerMile ?? null,
    predictedSplits: applySplitShape(predictedPaceSecPerMile, distanceMeters, markers, splitShape, closingLabel),
  };
}

// Once the real result is in. Null when the result itself can't produce a
// pace (missing/zero time or distance) — caller leaves the prediction
// unscored rather than recording a meaningless comparison.
function scorePrediction(predictedPaceSecPerMile, actualTimeSec, distanceMeters) {
  const actualPaceSecPerMile = paceSecPerMile(actualTimeSec, distanceMeters);
  if (actualPaceSecPerMile == null) return null;
  return {
    actualPaceSecPerMile,
    actualTimeSec,
    errorSecPerMile: actualPaceSecPerMile - predictedPaceSecPerMile,
  };
}

module.exports = {
  fitLinearTrend,
  projectSeasonFitness,
  computeBiasAndMargin,
  buildSplitShape,
  applySplitShape,
  buildRacePrediction,
  scorePrediction,
};
