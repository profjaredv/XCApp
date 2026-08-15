// Turns a meet's full-field FieldResult data into per-athlete placements
// for our own team's Results — see the Field Results feature (routes/
// fieldResults.js) and the Result.place/overallPlace schema comments.
//
// Two numbers, both optional depending on what the meet's structure and
// uploaded field data support:
//   - place: this athlete's place within their own race/division's field,
//     read straight from the FieldResult row athletic.net already recorded
//     (matched by name, not re-derived — the source's own tie-break rules
//     win over ours).
//   - overallPlace/overallFieldSize: when a meet splits one conceptual race
//     into ability-tiered heats (Boys Varsity Gold/Silver/Bronze, JV
//     Freshman/Sophomore/Junior-Senior, ...), the combined rank across every
//     race in that meet sharing the same distance and the same gender,
//     ranked by time. Only set when 2+ races actually share that key — a
//     single-heat race has nothing distinct to compute here.
//
// Pure functions, no Prisma — testable against fixtures, same pattern as
// lib/fieldResultsCsv.js and lib/bandAnalytics.js. The Prisma-touching
// caller (routes/fieldResults.js) is responsible for loading each of a
// meet's races with `results: { include: { athlete } }` and `fieldResults`,
// and for persisting what this returns.

const { normalizeAthleteName } = require('./athleteMatching');

/**
 * Infers a race's gender from the athletes who actually ran it — Race
 * itself doesn't store gender (see its schema comment: Athletic.net splits
 * boys/girls into separate race entries, but nothing enforces that split
 * mechanically here). A race with no results yet, or an exact M/F tie
 * (shouldn't happen for a real XC race, but not asserted), can't be
 * inferred and returns null.
 */
function inferRaceGender(resultsWithAthlete) {
  const counts = { M: 0, F: 0 };
  (resultsWithAthlete || []).forEach((r) => {
    const g = r.athlete && r.athlete.gender;
    if (g === 'M' || g === 'F') counts[g] += 1;
  });
  if (counts.M === 0 && counts.F === 0) return null;
  if (counts.M === counts.F) return null;
  return counts.M > counts.F ? 'M' : 'F';
}

function finishedFieldResults(fieldResults) {
  return (fieldResults || []).filter((fr) => fr.status === 'FINISHED' && fr.timeSec != null);
}

/**
 * races: Race rows for one meet, each with `results` (Result rows, each
 * with `athlete: { id, name, gender }` included) and `fieldResults`
 * (FieldResult rows) already loaded.
 *
 * Returns Map<resultId, { place, overallPlace, overallFieldSize }> — a
 * result with no name match in its race's field is omitted (caller should
 * treat a missing entry as "leave place/overallPlace/overallFieldSize
 * null").
 */
function computeMeetPlacements(races) {
  const placements = new Map();
  const matchByResultId = new Map(); // resultId -> matched FieldResult, kept locally to feed the overall-rank pass below

  races.forEach((race) => {
    const fieldResults = finishedFieldResults(race.fieldResults);
    const usedFieldResultIds = new Set();

    (race.results || []).forEach((result) => {
      const athleteName = result.athlete && result.athlete.name;
      const normalized = normalizeAthleteName(athleteName);
      const match = normalized
        ? fieldResults.find((fr) => !usedFieldResultIds.has(fr.id) && normalizeAthleteName(fr.athleteName) === normalized)
        : null;

      if (!match) return;
      usedFieldResultIds.add(match.id);
      matchByResultId.set(result.id, match);
      placements.set(result.id, { place: match.place ?? null, overallPlace: null, overallFieldSize: null });
    });
  });

  // Group races sharing a distance + inferred gender — the "same
  // conceptual race split into heats" case. A race with no distance or an
  // unresolvable gender can't be grouped and just keeps its race-level
  // place from above.
  const groups = new Map(); // "distance::gender" -> Race[]
  races.forEach((race) => {
    const gender = inferRaceGender(race.results);
    if (!gender || !race.distance) return;
    const key = `${race.distance}::${gender}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(race);
  });

  groups.forEach((groupRaces) => {
    if (groupRaces.length < 2) return; // nothing "overall" about a single heat

    const combinedFinishers = [];
    groupRaces.forEach((race) => {
      finishedFieldResults(race.fieldResults).forEach((fr) => combinedFinishers.push(fr));
    });
    combinedFinishers.sort((a, b) => a.timeSec - b.timeSec);

    const rankByFieldResultId = new Map();
    combinedFinishers.forEach((fr, idx) => rankByFieldResultId.set(fr.id, idx + 1));

    groupRaces.forEach((race) => {
      (race.results || []).forEach((result) => {
        const match = matchByResultId.get(result.id);
        if (!match) return;
        const entry = placements.get(result.id);
        entry.overallPlace = rankByFieldResultId.get(match.id) ?? null;
        entry.overallFieldSize = combinedFinishers.length;
      });
    });
  });

  return placements;
}

module.exports = { inferRaceGender, computeMeetPlacements };
