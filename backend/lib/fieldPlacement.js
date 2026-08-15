// Turns one race's full-field FieldResult data into per-athlete placements
// for our own team's Results — see the Field Results feature (routes/
// fieldResults.js) and the Result.division/place/overallPlace schema
// comments.
//
// ORIGIN (the season scraper) owns Race identity — one row per (team, meet,
// distance), unsplit by gender or division. FIELD works within that: for
// each of our own Results on the race, matched by name against the race's
// own FieldResult rows, this sets:
//   - division: the division/heat text that row's own results page reported
//     it under, straight from the match — no re-derivation.
//   - place: that match's own place, straight from the source.
//   - overallPlace/overallFieldSize: combined rank, by time, across every
//     FieldResult on this race sharing this athlete's gender (there can be
//     several divisions/heats of one gender on one race — Boys Varsity
//     Gold/Silver/Bronze, JV Freshman/Sophomore/..., all still one race).
//     Only set when that gender actually has 2+ distinct divisions present;
//     one heat has nothing "overall" to distinguish from "place".
//
// Pure functions, no Prisma — testable against fixtures, same pattern as
// lib/fieldResultsCsv.js and lib/bandAnalytics.js. The Prisma-touching
// caller (routes/fieldResults.js) loads the race with `results: { include:
// { athlete } }` and `fieldResults`, and persists what this returns.

const { normalizeAthleteName } = require('./athleteMatching');

function finishedFieldResults(fieldResults) {
  return (fieldResults || []).filter((fr) => fr.status === 'FINISHED' && fr.timeSec != null);
}

/**
 * race: a single Race row with `results` (Result rows, each with
 * `athlete: { id, name, gender }` included) and `fieldResults` (FieldResult
 * rows) already loaded.
 *
 * Returns Map<resultId, { division, place, overallPlace, overallFieldSize }>
 * — a result with no name match in the race's field is omitted (caller
 * should treat a missing entry as "leave everything null").
 */
function computeRacePlacements(race) {
  const placements = new Map();
  const matchByResultId = new Map(); // resultId -> matched FieldResult, needed again below for the overall-rank pass

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
    placements.set(result.id, {
      division: match.division ?? null,
      place: match.place ?? null,
      overallPlace: null,
      overallFieldSize: null,
    });
  });

  // Group every finished field result (not just our own matches — the
  // ranking needs the whole field) by gender. Rows with no gender recorded
  // can't be grouped into a same-gender cohort and are excluded.
  const byGender = new Map();
  fieldResults.forEach((fr) => {
    if (!fr.gender) return;
    if (!byGender.has(fr.gender)) byGender.set(fr.gender, []);
    byGender.get(fr.gender).push(fr);
  });

  byGender.forEach((group, gender) => {
    const distinctDivisions = new Set(group.map((fr) => fr.division).filter(Boolean));
    if (distinctDivisions.size < 2) return; // one division has no "overall" distinct from "place"

    const sorted = [...group].sort((a, b) => a.timeSec - b.timeSec);
    const rankByFieldResultId = new Map();
    sorted.forEach((fr, idx) => rankByFieldResultId.set(fr.id, idx + 1));

    matchByResultId.forEach((match, resultId) => {
      if (match.gender !== gender) return;
      const entry = placements.get(resultId);
      entry.overallPlace = rankByFieldResultId.get(match.id) ?? null;
      entry.overallFieldSize = sorted.length;
    });
  });

  return placements;
}

module.exports = { computeRacePlacements };
