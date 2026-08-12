// Group-scoped analytics: filter to a group's current roster, compare
// groups against each other, normalized to pace (sec/mile) so races of
// different distances are comparable. Deliberately computed live from
// Result/Race rows rather than the AthleteSeasonMetrics cache table
// (services/performance/calculationService.js) — that table needs an
// explicit calculation step to exist per season/athlete (the same gap
// that blocked viewing an athlete's profile before "2026 analysis" had
// been run), and this view must never have that same blocker.
//
// The kicker this exists for: an athlete with zero races yet this season
// (very common early season, or right after joining a group) would
// otherwise just show blank. Instead they fall back to their most recent
// prior season with data — always flagged (`isFallback: true`), and
// always excluded from a group's "this season" aggregate, so a coach
// never mistakes a blended number for this year's actual pace.

const { MILE_IN_METERS } = require('./distance');

function paceSecPerMile(timeSec, distanceMeters) {
  if (!(timeSec > 0) || !(distanceMeters > 0)) return null;
  const miles = distanceMeters / MILE_IN_METERS;
  return timeSec / miles;
}

// races: [{ timeSec, distanceMeters }, ...] — any race whose pace can't be
// computed (missing/zero time or distance) is counted in raceCount but
// excluded from the pace stats, never treated as a zero.
function summarizeRaces(races) {
  if (!Array.isArray(races) || races.length === 0) return null;
  const paces = races.map((r) => paceSecPerMile(r.timeSec, r.distanceMeters)).filter((p) => p != null);
  if (paces.length === 0) return null;
  return {
    raceCount: races.length,
    paceRaceCount: paces.length,
    bestPaceSecPerMile: Math.min(...paces),
    avgPaceSecPerMile: paces.reduce((sum, p) => sum + p, 0) / paces.length,
  };
}

// priorSeasonsByYearDesc: [{ year, races }, ...] sorted newest year first.
// Returns null only when the athlete has no pace-computable race in the
// target season or any prior season — a true "never raced," not a
// display gap.
function buildAthleteSeasonSummary({ targetSeason, currentSeasonRaces, priorSeasonsByYearDesc = [] }) {
  const current = summarizeRaces(currentSeasonRaces);
  if (current) {
    return { ...current, season: targetSeason, isFallback: false };
  }
  for (const { year, races } of priorSeasonsByYearDesc) {
    const summary = summarizeRaces(races);
    if (summary) {
      return { ...summary, season: year, isFallback: true };
    }
  }
  return null;
}

// athleteSummaries: the buildAthleteSeasonSummary() result per athlete in
// the group (nulls for athletes who have never raced are fine — they're
// filtered out here, not treated as a zero pace).
// Only non-fallback (this-season) summaries count toward the group's own
// "this season" numbers — a fallback athlete is visible per-athlete but
// never silently pulled into an aggregate a coach would read as current.
function summarizeGroup(athleteSummaries) {
  const withData = athleteSummaries.filter(Boolean);
  const currentSeason = withData.filter((a) => !a.isFallback);
  const fallback = withData.filter((a) => a.isFallback);

  return {
    athleteCount: athleteSummaries.length,
    currentSeasonCount: currentSeason.length,
    fallbackCount: fallback.length,
    neverRacedCount: athleteSummaries.length - withData.length,
    avgPaceSecPerMile:
      currentSeason.length > 0 ? currentSeason.reduce((sum, a) => sum + a.avgPaceSecPerMile, 0) / currentSeason.length : null,
    bestPaceSecPerMile: currentSeason.length > 0 ? Math.min(...currentSeason.map((a) => a.bestPaceSecPerMile)) : null,
  };
}

// Meet-by-meet trend, group-scoped: for one race, the group's spread of
// paces across whichever of its athletes raced it — min/avg/max, so the
// "explore" chart can show both a pace trend line and a range band per
// meet, the group-scoped analog of the team-wide Season Pace Trend/Pack
// Running charts (which both depend on the AthleteSeasonMetrics-adjacent
// MeetPerformanceMetrics cache; this stays live/uncached like the rest
// of this file, same reasoning as the module comment above).
// paces: number[] (sec/mile, already computed) for one race.
function summarizeGroupAtRace(paces) {
  const valid = paces.filter((p) => p != null && p > 0);
  if (valid.length === 0) return null;
  return {
    athleteCount: valid.length,
    avgPaceSecPerMile: valid.reduce((sum, p) => sum + p, 0) / valid.length,
    minPaceSecPerMile: Math.min(...valid),
    maxPaceSecPerMile: Math.max(...valid),
  };
}

module.exports = { paceSecPerMile, summarizeRaces, buildAthleteSeasonSummary, summarizeGroup, summarizeGroupAtRace };
