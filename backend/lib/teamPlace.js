// "Team place" — an athlete's rank among just our own team's finishers in a
// race, same gender only. Pure ORIGIN data (Athlete.gender + Result.time):
// no field-results upload required, always available once the season
// scraper has results for a race. Distinct from FIELD's Result.place (rank
// within this athlete's actual division's full field) and overallPlace
// (combined across that gender's divisions on the race) — see the Result
// schema comments. All three get displayed side by side, never conflated;
// this is the one that used to get silently computed inline as a plain
// array index wherever a race's results were shown (e.g. RaceVisualization.
// tsx's old `place: r.place || index + 1`), which quietly meant "team
// place" until Result.place started actually holding FIELD's value — same
// name, two different meanings. This gives it its own, explicit column.
//
// Pure function, no Prisma — same pattern as lib/fieldPlacement.js.

/**
 * results: [{ id, time, status, athlete: { gender } }] — this team's own
 * Results for one race.
 *
 * Returns Map<resultId, teamPlace>. Only FINISHED results with a time are
 * ranked; DNF/DNS/DQ/missing-time results are omitted (caller should treat
 * a missing entry as "no team place").
 */
function computeTeamPlaces(results) {
  const byGender = new Map();

  (results || []).forEach((result) => {
    if (result.status !== 'FINISHED' || result.time == null) return;
    const gender = (result.athlete && result.athlete.gender) || 'U';
    if (!byGender.has(gender)) byGender.set(gender, []);
    byGender.get(gender).push(result);
  });

  const teamPlaces = new Map();
  byGender.forEach((group) => {
    const sorted = [...group].sort((a, b) => a.time - b.time);
    sorted.forEach((result, idx) => teamPlaces.set(result.id, idx + 1));
  });

  return teamPlaces;
}

module.exports = { computeTeamPlaces };
