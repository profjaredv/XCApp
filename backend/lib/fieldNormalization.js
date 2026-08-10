// Field-relative normalization (Build Spec, "Core measurement decisions").
// fieldRatio = athleteTimeSec / fieldMeanSec. A ratio below 1.0 is faster
// than the field average; mud, heat, a re-marked course, and a slow year
// shift the whole field and cancel out of the ratio automatically.
//
// Callers are responsible for excluding DNF/DNS/DQ finishers and splitting
// by gender before calling computeFieldStats — this module only does the
// arithmetic on whatever list of times it's given.

const MIN_FIELD_SIZE = 40;

function computeFieldStats(finishTimesSec) {
  const finisherCount = finishTimesSec.length;

  if (finisherCount < MIN_FIELD_SIZE) {
    return { fieldMeanSec: null, fieldMedianSec: null, fieldFinisherCount: finisherCount };
  }

  const sorted = [...finishTimesSec].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, t) => sum + t, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return { fieldMeanSec: mean, fieldMedianSec: median, fieldFinisherCount: finisherCount };
}

function fieldRatio(athleteTimeSec, fieldMeanSec) {
  if (athleteTimeSec == null || fieldMeanSec == null || fieldMeanSec <= 0) return null;
  return athleteTimeSec / fieldMeanSec;
}

module.exports = { MIN_FIELD_SIZE, computeFieldStats, fieldRatio };
