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
//
// "Newbie gains" guard: improvement % is relative to the athlete's OWN
// starting time, so someone who came in and ran a 40:00 5K, then dropped
// to 30:00, posts a 25% improvement — bigger than almost anyone already
// fit could ever produce — without being anywhere near competitive. That's
// real fitness gain, just not the "quietly ready for more" signal this
// list is for. So growth only counts toward the watch list if the
// athlete's CURRENT pace (their most recent race, not the season average,
// which would still be dragged down by that slow start) is within
// `competitiveToleranceStdDev` of the team's average current pace —
// competitiveness is decided by where they are now, not how far they
// came. Consistency/regression flags are untouched by this gate: pacing
// instruction and decline are worth flagging regardless of speed tier.

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
    // Where they are NOW, not blended with a slow start — the basis for
    // the "newbie gains" competitiveness gate below.
    mostRecentPaceSecPerMile: round2(paces[paces.length - 1]),
    improvementPct: round2(improvementPct),
    consistencyPct: round2(consistencyPct),
  };
}

/**
 * @param athletes [{ id, name, gender, grade, races: [{ timeSec, distanceMeters, date }] }]
 * @param options  { topExcludeCount, watchListSize, consistencyWeight, growthWeight, concernThreshold, minRacesForRegressionRisk, competitiveToleranceStdDev }
 */
function computeCoachUpAnalysis(athletes, options = {}) {
  const {
    topExcludeCount = 7,
    watchListSize = 5,
    consistencyWeight = 0.4,
    growthWeight = 0.6,
    concernThreshold = -1.5,
    minRacesForRegressionRisk = 3,
    // How far off the team's current pace an athlete may be and still
    // count as "competitive enough to watch." 1.25 standard deviations
    // above the group's average current pace — generous enough not to
    // exclude a mid-pack athlete, tight enough to exclude someone who's
    // still clearly building a base.
    competitiveToleranceStdDev = 1.25,
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

    // Positive recentPaceZ = slower than the group's current average;
    // "competitive" means not more than the tolerance above that average.
    const recentPaceZ = zScores(group.map((a) => a.mostRecentPaceSecPerMile));

    group.forEach((athlete, i) => {
      scored.push({
        ...athlete,
        consistencyZ: round2(consistencyZ[i]),
        growthZ: round2(growthZ[i]),
        combinedScore: round2(consistencyWeight * consistencyZ[i] + growthWeight * growthZ[i]),
        alreadyVisible: alreadyVisible.has(athlete.id),
        isCompetitive: recentPaceZ[i] <= competitiveToleranceStdDev,
      });
    });
  }

  const watchList = scored
    .filter((a) => !a.alreadyVisible && a.isCompetitive)
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
