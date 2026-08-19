// Workstream E1 (LeadPack Master Build Handoff): pure computation for one
// athlete's multi-season journey. No Prisma here — routes/analytics.js
// fetches rows and shapes them into the plain inputs below, same split as
// lib/bandAnalytics.js (and for the same reason: this sandbox has no
// DATABASE_URL, so correctness has to be provable against constructed
// fixtures instead of a live query).

const { paceSecPerMile } = require('./groupAnalytics');
const { computeBandRanges, bandForRank, rankAthletesBySeasonBestPace } = require('./bandAnalytics');

// Same defaults routes/bandAnalytics.js uses — an athlete's band on their
// own journey page has to mean the same thing it means on Program (Band
// Trends), or "top band" would be two different claims depending on which
// screen you're reading it from.
const DEFAULT_TOP_SIZE = 20;
const DEFAULT_BOTTOM_SIZE = 30;

// The band this rank falls in, given a roster size — reuses
// lib/bandAnalytics.js's own range/classification logic verbatim rather
// than re-deriving band boundaries a second way.
function bandForSeasonRank(rank, rosterSize, topSize = DEFAULT_TOP_SIZE, bottomSize = DEFAULT_BOTTOM_SIZE) {
  if (!rosterSize) return null;
  const ranges = computeBandRanges(rosterSize, topSize, bottomSize);
  return bandForRank(rank, ranges);
}

// results: this one athlete's own FINISHED results for one season:
// [{ raceId, raceName, date, time, distanceMeters }]. The fastest PACE
// that season, reported both as pace and as that same race's raw time —
// deliberately the same race two ways, not two different races, since a
// faster raw time at a shorter distance isn't a faster season, just a
// shorter one.
function computeSeasonBest(results) {
  let best = null;
  for (const r of results) {
    const pace = paceSecPerMile(r.time, r.distanceMeters);
    if (pace == null) continue;
    if (!best || pace < best.paceSecPerMile) {
      best = {
        paceSecPerMile: pace,
        timeSec: r.time,
        raceId: r.raceId,
        raceName: r.raceName,
        date: r.date,
        distanceMeters: r.distanceMeters,
      };
    }
  }
  return best;
}

// results: this athlete's own results across every season:
// [{ raceId, raceName, date, time, courseId, courseName }]. Only courses
// raced 2+ times qualify — a single race on a course has no delta to show.
// deltaSec is worst-minus-best (positive = improved), not most-recent
// versus best, so it reads the same regardless of whether their fastest
// run on that course happened to be their first or their last.
function computeCourseBests(results) {
  const byCourse = new Map();
  for (const r of results) {
    if (!r.courseId || r.time == null) continue;
    if (!byCourse.has(r.courseId)) byCourse.set(r.courseId, []);
    byCourse.get(r.courseId).push(r);
  }

  const courseBests = [];
  for (const [courseId, races] of byCourse) {
    if (races.length < 2) continue;
    const sorted = [...races].sort((a, b) => a.time - b.time);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    courseBests.push({
      courseId,
      courseName: best.courseName,
      raceCount: races.length,
      bestTimeSec: best.time,
      bestRaceId: best.raceId,
      bestRaceName: best.raceName,
      bestDate: best.date,
      worstTimeSec: worst.time,
      deltaSec: worst.time - best.time,
    });
  }

  return courseBests.sort((a, b) => (a.courseName || '').localeCompare(b.courseName || ''));
}

// results: this athlete's own results across every season:
// [{ raceId, raceName, date, time, distanceMeters }]. One PR per distinct
// distance — distances are rounded to the nearest meter before grouping so
// the same input string (parsed identically every time by lib/distance.js)
// never accidentally splits into two buckets over floating-point noise.
function computePRs(results) {
  const byDistance = new Map();
  for (const r of results) {
    if (r.distanceMeters == null || r.time == null) continue;
    const key = Math.round(r.distanceMeters);
    const current = byDistance.get(key);
    if (!current || r.time < current.time) {
      byDistance.set(key, { distanceMeters: key, time: r.time, raceId: r.raceId, raceName: r.raceName, date: r.date });
    }
  }
  return [...byDistance.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

module.exports = {
  DEFAULT_TOP_SIZE,
  DEFAULT_BOTTOM_SIZE,
  rankAthletesBySeasonBestPace,
  bandForSeasonRank,
  computeSeasonBest,
  computeCourseBests,
  computePRs,
};
