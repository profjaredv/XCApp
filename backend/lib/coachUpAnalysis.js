// Deterministic "who should we coach up" scoring — no AI, no anonymization
// needed (nothing here ever leaves this process), no API key required. See
// the discussion that led to this: an LLM is good at turning numbers into
// prose, but "who's quietly trending up but isn't already the obvious
// star" is a ranking problem, and a small scored model answers it more
// reliably (and more explainably — every number here can be traced back to
// a specific race) than asking a model to eyeball a stats table.
//
// The idea: z-score each athlete's consistency and season-long improvement
// against their own gender group (never mixed — pace isn't comparable
// across genders any more than across distances), combine into one score,
// then exclude the athletes who are already the team's fastest — the ones
// a coach doesn't need an algorithm to notice. What's left, ranked, is the
// watch list: real signal, low visibility.

const { paceSecPerMile } = require('./groupAnalytics');

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values, avg) {
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// z-score each value against its own group; a group where every value is
// identical (sd === 0) has no meaningful spread, so everyone scores 0
// rather than dividing by zero.
function zScores(values) {
  const avg = mean(values);
  const sd = stdDev(values, avg);
  if (sd === 0) return values.map(() => 0);
  return values.map((v) => (v - avg) / sd);
}

function round2(n) {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded; // normalize -0 (e.g. from a sign flip on a zero z-score)
}

// One athlete's season, reduced to the three numbers the scoring model
// needs. `races`: [{ timeSec, distanceMeters, date }], any order — sorted
// here by date. Distance-normalized (pace, not raw time) so a 5K and a
// 3200m count the same. Returns null for fewer than 2 usable races —
// nothing to measure a trend or a variance from with just one.
function computeAthleteMetrics(athlete) {
  const withPace = (athlete.races || [])
    .filter((r) => r.timeSec > 0 && r.distanceMeters > 0)
    .map((r) => ({ ...r, paceSecPerMile: paceSecPerMile(r.timeSec, r.distanceMeters) }))
    .filter((r) => r.paceSecPerMile != null)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (withPace.length < 2) return null;

  const paces = withPace.map((r) => r.paceSecPerMile);
  const avgPaceSecPerMile = mean(paces);
  // Positive = faster by season's end (pace went down).
  const improvementPct = ((paces[0] - paces[paces.length - 1]) / paces[0]) * 100;
  const consistencyPct = (stdDev(paces, avgPaceSecPerMile) / avgPaceSecPerMile) * 100;

  return {
    id: athlete.id,
    name: athlete.name,
    gender: athlete.gender ?? null,
    grade: athlete.grade ?? null,
    raceCount: withPace.length,
    avgPaceSecPerMile: round2(avgPaceSecPerMile),
    improvementPct: round2(improvementPct),
    consistencyPct: round2(consistencyPct),
  };
}

/**
 * @param athletes [{ id, name, gender, grade, races: [{ timeSec, distanceMeters, date }] }]
 * @param options  { topExcludeCount, watchListSize, consistencyWeight, growthWeight, concernThreshold, minRacesForRegressionRisk }
 */
function computeCoachUpAnalysis(athletes, options = {}) {
  const {
    topExcludeCount = 7,
    watchListSize = 5,
    consistencyWeight = 0.4,
    growthWeight = 0.6,
    concernThreshold = -1.5,
    minRacesForRegressionRisk = 3,
  } = options;

  const metrics = (athletes || []).map(computeAthleteMetrics).filter((m) => m !== null);

  const byGender = new Map();
  for (const m of metrics) {
    const key = m.gender || 'UNKNOWN';
    if (!byGender.has(key)) byGender.set(key, []);
    byGender.get(key).push(m);
  }

  const scored = [];
  for (const group of byGender.values()) {
    // Lower consistencyPct (less variance) is better, so invert the sign —
    // positive consistencyZ always means "more consistent than peers."
    const consistencyZ = zScores(group.map((a) => a.consistencyPct)).map((z) => -z);
    const growthZ = zScores(group.map((a) => a.improvementPct));

    const alreadyVisible = new Set(
      [...group]
        .sort((a, b) => a.avgPaceSecPerMile - b.avgPaceSecPerMile) // lower pace = faster
        .slice(0, topExcludeCount)
        .map((a) => a.id)
    );

    group.forEach((athlete, i) => {
      scored.push({
        ...athlete,
        consistencyZ: round2(consistencyZ[i]),
        growthZ: round2(growthZ[i]),
        combinedScore: round2(consistencyWeight * consistencyZ[i] + growthWeight * growthZ[i]),
        alreadyVisible: alreadyVisible.has(athlete.id),
      });
    });
  }

  const watchList = scored
    .filter((a) => !a.alreadyVisible)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, watchListSize);

  const consistencyConcerns = scored
    .filter((a) => a.consistencyZ <= concernThreshold)
    .sort((a, b) => a.consistencyZ - b.consistencyZ);

  const regressionRisks = scored
    .filter((a) => a.growthZ <= concernThreshold && a.raceCount >= minRacesForRegressionRisk)
    .sort((a, b) => a.growthZ - b.growthZ);

  return { athletes: scored, watchList, consistencyConcerns, regressionRisks };
}

module.exports = { computeCoachUpAnalysis, computeAthleteMetrics };
