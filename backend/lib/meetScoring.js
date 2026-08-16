// Standard cross-country team scoring computed straight from a race's
// FieldResult rows — the field upload already carries every school's
// finishers (FieldResult.schoolName), not just ours, because it's copied
// from the meet's own results/all page. That's what makes real scoring
// possible without an extra data source.
//
// Rules implemented (standard XC scoring — see e.g. NFHS/NCAA):
//   - Scoring is per division (one division = one race for scoring
//     purposes — Boys Varsity Gold and Boys JV Silver are scored
//     separately, never combined).
//   - A team's score is the sum of the finishing places of its first 5
//     runners in that division's full field.
//   - Runners 6 and 7 are "displacers": they don't score, but by finishing
//     ahead of other teams' scorers they push those teams' point totals up.
//     They're surfaced for context, not included in the score.
//   - A team needs 5 finishers in a division to score at all; fewer than
//     5 and the team just doesn't score that division (still shown, so a
//     coach can see who ran and why the team didn't score, not silently
//     dropped).
//   - Ties break on the 5th (last-counted) scorer's place — the team whose
//     5th runner placed better wins the tie.
//   - A row with no schoolName can't be scored as a team (there's no team
//     to attribute it to) but its place is left as-is — it still occupies
//     a spot in the field and pushes every other team's places down,
//     exactly as it would on the real results page.
//
// Pure functions, no Prisma — same pattern as lib/fieldPlacement.js and
// lib/bandAnalytics.js. The caller (routes/meets.js) loads the race with
// `results: { include: { athlete } }` and `fieldResults`, and passes it in.

const { finishedFieldResults, matchResultsToFieldResults } = require('./fieldPlacement');

const SCORERS_PER_TEAM = 5;
const DISPLACERS_PER_TEAM = 2;
const INDIVIDUAL_TOP_COUNT = 3;
const OUR_TEAM_DEPTH = 10; // how many of our own finishers to surface per division ("top 10 in the field")

function toRunnerView(fr) {
  return { athleteName: fr.athleteName, schoolName: fr.schoolName, place: fr.place, timeSec: fr.timeSec };
}

/**
 * fieldResults: FieldResult rows for ONE division, already filtered to
 * finished rows with a known place.
 * ourFieldResultIds: Set of FieldResult ids that matched one of our own
 * Results (see matchResultsToFieldResults) — used only to flag `isOurTeam`.
 */
function computeDivisionScoring(fieldResults, ourFieldResultIds = new Set()) {
  const withPlace = fieldResults.filter((fr) => fr.place != null);

  const bySchool = new Map();
  withPlace.forEach((fr) => {
    const school = (fr.schoolName || '').trim();
    if (!school) return; // no team to attribute this finisher to
    if (!bySchool.has(school)) bySchool.set(school, []);
    bySchool.get(school).push(fr);
  });

  const teams = [...bySchool.entries()].map(([schoolName, rows]) => {
    const sorted = [...rows].sort((a, b) => a.place - b.place);
    const scorers = sorted.slice(0, SCORERS_PER_TEAM);
    const displacers = sorted.slice(SCORERS_PER_TEAM, SCORERS_PER_TEAM + DISPLACERS_PER_TEAM);
    const canScore = scorers.length === SCORERS_PER_TEAM;
    const score = canScore ? scorers.reduce((sum, r) => sum + r.place, 0) : null;
    const tiebreakPlace = canScore ? scorers[SCORERS_PER_TEAM - 1].place : null;

    return {
      schoolName,
      isOurTeam: rows.some((r) => ourFieldResultIds.has(r.id)),
      finisherCount: rows.length,
      canScore,
      score,
      tiebreakPlace,
      scorers: scorers.map(toRunnerView),
      displacers: displacers.map(toRunnerView),
    };
  });

  const scoringTeams = teams
    .filter((t) => t.canScore)
    .sort((a, b) => a.score - b.score || a.tiebreakPlace - b.tiebreakPlace)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  const incompleteTeams = teams
    .filter((t) => !t.canScore)
    .sort((a, b) => b.finisherCount - a.finisherCount);

  const individualTop = [...withPlace]
    .sort((a, b) => a.place - b.place)
    .slice(0, INDIVIDUAL_TOP_COUNT)
    .map(toRunnerView);

  const ourRows = withPlace
    .filter((fr) => ourFieldResultIds.has(fr.id))
    .sort((a, b) => a.place - b.place);

  return {
    // Total finishers with a known place in this division — the correct
    // denominator for "place N of fieldSize" in this division, unlike
    // Result.overallFieldSize, which can span multiple divisions of a race
    // and is only meaningful when those divisions are genuinely the same
    // event (known gap, not fixed here — see Result.overallPlace comment).
    fieldSize: withPlace.length,
    scoringTeams,
    incompleteTeams,
    individualTop,
    ourTeamFinishers: ourRows.slice(0, OUR_TEAM_DEPTH).map(toRunnerView),
    ourTeamFinisherCount: ourRows.length,
  };
}

/**
 * race: a Race row with `results` (Result[] with `athlete: { name }`
 * included) and `fieldResults` (FieldResult[]) already loaded — the same
 * shape computeRacePlacements (lib/fieldPlacement.js) expects.
 *
 * Returns one entry per division present in the race's field data, each
 * carrying that division's scoring. A race with no field-results upload
 * yet returns an empty array — the caller/frontend treats that as "no
 * scoring available for this race."
 */
function computeMeetScoring(race) {
  const fieldResults = finishedFieldResults(race.fieldResults);
  if (fieldResults.length === 0) return [];

  const matchByResultId = matchResultsToFieldResults(race.results, fieldResults);
  const ourFieldResultIds = new Set([...matchByResultId.values()].map((fr) => fr.id));

  const byDivision = new Map();
  fieldResults.forEach((fr) => {
    const division = fr.division || 'Unknown Division';
    if (!byDivision.has(division)) byDivision.set(division, []);
    byDivision.get(division).push(fr);
  });

  return [...byDivision.entries()].map(([division, rows]) => ({
    division,
    ...computeDivisionScoring(rows, ourFieldResultIds),
  }));
}

module.exports = {
  SCORERS_PER_TEAM,
  DISPLACERS_PER_TEAM,
  computeDivisionScoring,
  computeMeetScoring,
};
