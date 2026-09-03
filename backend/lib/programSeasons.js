const { paceSecPerMile } = require('./groupAnalytics');

// The per-season shape of a program: how many turned out, how many came
// back, how much they raced, how fast they were, and how tight the top
// five finished.
//
// Pure and DB-free, like lib/programAnalytics.js next to it, so every
// number here can be checked against constructed fixtures rather than
// against whatever happens to be in one team's database.
//
// One rule runs through all of it: computed from results and roster rows,
// never from TeamSeasonMetrics. The cached metrics only exist for seasons
// somebody remembered to run "Recalculate Metrics" on, which is why the
// Program screen's miles chart could sit empty for years of real racing.
// A screen about a program's history cannot depend on a manual step
// nobody was told to take.
//
// Counts a coach reads as comparable have to BE comparable, so the
// per-athlete versions are here too: a season with more meets logs more
// miles without anyone running further, and a bigger roster races more
// times without anyone racing more often.

const MILE_IN_METERS = 1609.34;
/** Below this, a median is one or two people and says nothing about a program. */
const MIN_FOR_MEDIAN = 3;
/** The scoring five. A spread needs all of them to mean anything. */
const PACK_SIZE = 5;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Median season-best pace for one gender — the program's speed, in a
 * number that survives a roster changing size.
 *
 * Median rather than mean: one transfer who runs 5:10 moves a mean and
 * tells a coach the program got faster when it didn't. And season-BEST
 * per athlete rather than every race, so a season where everyone raced
 * nine times isn't weighted against one where they raced four.
 */
function medianBestPace(rows) {
  const bestByAthlete = new Map();
  for (const row of rows) {
    const pace = paceSecPerMile(row.timeSec, row.distanceMeters);
    if (pace == null) continue;
    const current = bestByAthlete.get(row.athleteId);
    if (current === undefined || pace < current) bestByAthlete.set(row.athleteId, pace);
  }
  if (bestByAthlete.size < MIN_FOR_MEDIAN) {
    return { paceSecPerMile: null, athleteCount: bestByAthlete.size };
  }
  return { paceSecPerMile: median([...bestByAthlete.values()]), athleteCount: bestByAthlete.size };
}

/**
 * The tightest 1-through-5 spread the team achieved in a season, in
 * seconds, and the race it happened at.
 *
 * Best race rather than an average of every race: pack tightness is a
 * thing a team achieves on a day, and averaging it across a season mixes
 * championship line-ups with the meet where half the squad sat out. Only
 * races where five of them actually finished can produce one.
 */
function bestPackSpread(rows) {
  const byRace = new Map();
  for (const row of rows) {
    if (!(row.timeSec > 0)) continue;
    if (!byRace.has(row.raceId)) byRace.set(row.raceId, []);
    byRace.get(row.raceId).push(row);
  }

  let best = null;
  for (const [raceId, raceRows] of byRace) {
    if (raceRows.length < PACK_SIZE) continue;
    const times = raceRows.map((r) => r.timeSec).sort((a, b) => a - b);
    const spread = times[PACK_SIZE - 1] - times[0];
    if (best === null || spread < best.spreadSec) {
      best = { spreadSec: spread, raceId, raceName: raceRows[0].raceName ?? null, date: raceRows[0].date ?? null };
    }
  }
  return best;
}

/**
 * Season-over-season roster churn.
 *
 * rosterByYear: Map<year, Set<athleteId>>. Returns, per year, how many of
 * that year's athletes were on the previous year's roster and how many
 * were not. The first year on file gets nulls rather than zeros — nobody
 * "failed to return" to a season that isn't in the data, and reporting 0%
 * returning for it would be a fabrication, not a fact about the program.
 */
function computeChurn(rosterByYear) {
  const years = [...rosterByYear.keys()].sort((a, b) => a - b);
  const churn = new Map();
  for (const year of years) {
    const roster = rosterByYear.get(year);
    const previous = rosterByYear.get(year - 1);
    if (!previous || previous.size === 0) {
      churn.set(year, { returning: null, newcomers: null, previousSize: null, returnRate: null });
      continue;
    }
    let returning = 0;
    for (const athleteId of roster) if (previous.has(athleteId)) returning += 1;
    churn.set(year, {
      returning,
      newcomers: roster.size - returning,
      previousSize: previous.size,
      returnRate: parseFloat(((returning / previous.size) * 100).toFixed(1)),
    });
  }
  return churn;
}

/**
 * Everything the Program screen shows per season, from raw rows.
 *
 * resultRows: [{ athleteId, gender, season, raceId, raceName, date, timeSec, distanceMeters }]
 *   — every finished result across the seasons of interest.
 * rosterByYear: Map<year, Set<athleteId>> from SeasonRoster.
 */
function buildSeasonShapes(resultRows, rosterByYear, years) {
  const churn = computeChurn(rosterByYear);
  const bySeason = new Map();
  for (const row of resultRows || []) {
    if (!bySeason.has(row.season)) bySeason.set(row.season, []);
    bySeason.get(row.season).push(row);
  }

  return years.map((year) => {
    const rows = bySeason.get(year) ?? [];
    const raced = new Set(rows.map((r) => r.athleteId));
    const meets = new Set(rows.map((r) => r.raceId)).size;
    const raceMiles = rows.reduce(
      (sum, r) => sum + (r.distanceMeters > 0 ? r.distanceMeters / MILE_IN_METERS : 0),
      0
    );
    const rosterSize = (rosterByYear.get(year) ?? new Set()).size;

    return {
      season: year,
      meets,
      racesRun: rows.length,
      racedCount: raced.size,
      raceMiles: parseFloat(raceMiles.toFixed(1)),
      // Per-athlete, so a season isn't credited for being longer or bigger.
      racesPerAthlete: raced.size > 0 ? parseFloat((rows.length / raced.size).toFixed(1)) : null,
      milesPerAthlete: raced.size > 0 ? parseFloat((raceMiles / raced.size).toFixed(1)) : null,
      // How many of the roster ever pinned on a number. A program with 40
      // athletes and 18 racers is a different program from one with 20 and 18.
      racedShare:
        rosterSize > 0 ? parseFloat(((raced.size / rosterSize) * 100).toFixed(1)) : null,
      medianPace: {
        men: medianBestPace(rows.filter((r) => r.gender === 'M')),
        women: medianBestPace(rows.filter((r) => r.gender === 'F')),
      },
      packSpread: {
        men: bestPackSpread(rows.filter((r) => r.gender === 'M')),
        women: bestPackSpread(rows.filter((r) => r.gender === 'F')),
      },
      churn: churn.get(year) ?? { returning: null, newcomers: null, previousSize: null, returnRate: null },
    };
  });
}

module.exports = {
  MILE_IN_METERS,
  MIN_FOR_MEDIAN,
  PACK_SIZE,
  median,
  medianBestPace,
  bestPackSpread,
  computeChurn,
  buildSeasonShapes,
};
