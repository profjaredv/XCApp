const { paceSecPerMile } = require('./groupAnalytics');
const { deriveGrade } = require('./season');

// Footsteps: "runners in this program who were where you are now — and
// where they ended up."
//
// Every team with a few seasons on file is sitting on the best prediction
// it will ever get for a young runner: its own alumni. A sophomore running
// 21:10 is not helped much by a generic formula, but the six runners this
// same program has had who ran within a few seconds of that as sophomores,
// under the same coach on mostly the same courses, are a real answer to
// "what could I run by senior year?".
//
// Pure and DB-free, so every number can be checked against constructed
// fixtures. Deterministic rules, no generation: a projection here is the
// athlete's own best plus what those specific alumni actually gained, with
// the range and the count always attached. Below MIN_MATCHES there is no
// projection at all rather than a confident number resting on one person.

const MILE_IN_METERS = 1609.34;
const FIVE_K_MILES = 5000 / MILE_IN_METERS;
/** Only races near 5K count. A 1-mile time trial or a 2-mile JV race is a different pace entirely. */
const MIN_DISTANCE_M = 4000;
const MAX_DISTANCE_M = 5300;
/** A "match" ran within this much of the athlete at the same grade: 4% of pace, never tighter than 12 s/mi. */
const TOLERANCE_SHARE = 0.04;
const TOLERANCE_FLOOR_SEC = 12;
const MAX_MATCHES = 6;
/** Fewer than this and a projection is one or two people's story, not a pattern. */
const MIN_MATCHES = 3;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const fiveK = (pace) => (pace == null ? null : Math.round(pace * FIVE_K_MILES));

/**
 * Season-best 5K-ish pace per grade for every athlete.
 * athletes: [{ id, graduationYear }]
 * results:  [{ athleteId, season, timeSec, distanceMeters }]
 * -> Map(athleteId -> Map(grade -> paceSecPerMile))
 */
function bestPaceByGrade(athletes, results) {
  const gradYear = new Map(athletes.map((a) => [a.id, a.graduationYear]));
  const out = new Map();
  for (const r of results) {
    if (!(r.distanceMeters >= MIN_DISTANCE_M && r.distanceMeters <= MAX_DISTANCE_M)) continue;
    const pace = paceSecPerMile(r.timeSec, r.distanceMeters);
    if (pace == null) continue;
    const grade = deriveGrade(gradYear.get(r.athleteId), r.season);
    if (grade == null) continue;
    if (!out.has(r.athleteId)) out.set(r.athleteId, new Map());
    const byGrade = out.get(r.athleteId);
    const current = byGrade.get(grade);
    if (current === undefined || pace < current) byGrade.set(grade, pace);
  }
  return out;
}

function path(byGrade) {
  return [...byGrade.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([grade, pace]) => ({ grade, paceSecPerMile: Math.round(pace * 10) / 10, fiveKSec: fiveK(pace) }));
}

/**
 * athletes: the athlete plus every same-gender athlete the program has had:
 *           [{ id, name, graduationYear }]
 * results:  their finished results: [{ athleteId, season, timeSec, distanceMeters }]
 * showNames: coaches see who the matches are; an athlete or guardian sees
 *            "Class of 2022" and nothing that names another student.
 */
function buildFootsteps({ athleteId, athletes, results, showNames = false }) {
  const paces = bestPaceByGrade(athletes, results);
  const mine = paces.get(athleteId);
  const me = athletes.find((a) => a.id === athleteId);

  const base = { status: 'ok', athlete: null, matches: [], projection: [], summary: null, poolSize: 0 };

  if (!me || !Number.isFinite(me.graduationYear)) return { ...base, status: 'no-class-year' };
  if (!mine || mine.size === 0) return { ...base, status: 'no-races' };

  const grades = [...mine.keys()].sort((a, b) => a - b);
  const fromGrade = grades[grades.length - 1];
  const fromPace = mine.get(fromGrade);
  const athlete = { fromGrade, paceSecPerMile: Math.round(fromPace * 10) / 10, fiveKSec: fiveK(fromPace), path: path(mine) };

  const tolerance = Math.max(TOLERANCE_FLOOR_SEC, fromPace * TOLERANCE_SHARE);

  // Everyone whose future from this grade is already known.
  const pool = [];
  for (const other of athletes) {
    if (other.id === athleteId) continue;
    const theirs = paces.get(other.id);
    if (!theirs || !theirs.has(fromGrade)) continue;
    if (![...theirs.keys()].some((g) => g > fromGrade)) continue;
    pool.push({ other, theirs });
  }

  const scored = [];
  for (const { other, theirs } of pool) {
    const gapNow = Math.abs(theirs.get(fromGrade) - fromPace);
    if (gapNow > tolerance) continue;
    // Shape of the path so far counts too, at half the weight of right now.
    let weighted = gapNow * 2;
    let weight = 2;
    for (const g of grades) {
      if (g === fromGrade || !theirs.has(g)) continue;
      weighted += Math.abs(theirs.get(g) - mine.get(g));
      weight += 1;
    }
    scored.push({ other, theirs, distance: weighted / weight, gapNow });
  }
  scored.sort((a, b) => a.distance - b.distance || String(a.other.id).localeCompare(String(b.other.id)));
  const chosen = scored.slice(0, MAX_MATCHES);

  const matches = chosen.map(({ other, theirs, gapNow }) => {
    const laterGrades = [...theirs.keys()].filter((g) => g > fromGrade);
    const bestLater = Math.min(...laterGrades.map((g) => theirs.get(g)));
    const lastGrade = Math.max(...laterGrades);
    return {
      ...(showNames ? { athleteId: other.id, name: other.name } : {}),
      label: showNames ? other.name : `Class of ${other.graduationYear}`,
      graduationYear: other.graduationYear,
      gapAtGradeSec: Math.round(gapNow),
      atGrade: { grade: fromGrade, paceSecPerMile: Math.round(theirs.get(fromGrade) * 10) / 10, fiveKSec: fiveK(theirs.get(fromGrade)) },
      best: { paceSecPerMile: Math.round(bestLater * 10) / 10, fiveKSec: fiveK(bestLater) },
      lastGrade,
      // Positive = got faster after this grade.
      gainSec: fiveK(theirs.get(fromGrade)) - fiveK(bestLater),
      path: path(theirs),
    };
  });

  if (fromGrade >= 12) return { ...base, status: 'final-year', athlete, poolSize: pool.length };

  // What the matches went on to do, applied to this athlete's own time.
  const projection = [];
  if (chosen.length >= MIN_MATCHES) {
    const maxGrade = Math.max(...chosen.flatMap((c) => [...c.theirs.keys()]));
    for (let grade = fromGrade + 1; grade <= maxGrade; grade++) {
      const deltas = chosen.filter((c) => c.theirs.has(grade)).map((c) => c.theirs.get(grade) - c.theirs.get(fromGrade));
      if (deltas.length < MIN_MATCHES) continue;
      const mid = median(deltas);
      projection.push({
        grade,
        basedOn: deltas.length,
        improved: deltas.filter((d) => d < 0).length,
        fiveKSec: fiveK(fromPace + mid),
        // Fastest and slowest outcome among the matches, not a confidence interval.
        fastestFiveKSec: fiveK(fromPace + Math.min(...deltas)),
        slowestFiveKSec: fiveK(fromPace + Math.max(...deltas)),
        medianChangeSec: fiveK(fromPace + mid) - fiveK(fromPace),
      });
    }
  }

  const status = chosen.length === 0 ? 'no-matches' : chosen.length < MIN_MATCHES ? 'few-matches' : 'ok';
  const last = projection[projection.length - 1] || null;
  const summary = {
    matchCount: chosen.length,
    toleranceSec: Math.round(tolerance),
    improvedCount: matches.filter((m) => m.gainSec > 0).length,
    medianGainSec: matches.length ? Math.round(median(matches.map((m) => m.gainSec))) : null,
    projectedGrade: last ? last.grade : null,
    projectedFiveKSec: last ? last.fiveKSec : null,
  };

  return { status, athlete, matches, projection, summary, poolSize: pool.length };
}

module.exports = { buildFootsteps, bestPaceByGrade, MIN_MATCHES, MAX_MATCHES, MIN_DISTANCE_M, MAX_DISTANCE_M };
