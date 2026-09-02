const { paceSecPerMile } = require('./groupAnalytics');

// The comparison lines on an athlete's Career Progress chart: what the
// team, the boys and the girls averaged in each season this athlete raced.
//
// The card has always claimed to show these. It stopped actually showing
// them when GET /api/multi-season/trends was removed for silently dropping
// every championship race and taking an unweighted mean — the lines were
// nulled out and the promise in the subtitle was left behind, so the chart
// rendered a legend for three series that never appeared. This computes
// them properly instead.
//
// Two pairings that have to match the athlete's own line, or the chart
// compares unlike things:
//
//   - The athlete's 5K line is their BEST 5K of the season, so the group
//     line is the average of each teammate's best 5K — a mean of bests,
//     not a mean of every race run. Averaging all races against one best
//     would make every athlete look good.
//   - The athlete's pace line is their season's total time over total
//     miles, so the group line aggregates the same way (all seconds over
//     all miles), which is how team pace is computed everywhere else in
//     the app (services/performance/calculationService.js).
//
// Boys and girls are separate series because they always are; the team
// line mixes them, which is what "team average" means and why it is the
// least useful of the three.

// Matching calculationService's own 5K band — courses are measured
// approximately and a "5K" is rarely exactly 5000m.
const FIVE_K_MIN_METERS = 4900;
const FIVE_K_MAX_METERS = 5100;

function isFiveK(distanceMeters) {
  return distanceMeters >= FIVE_K_MIN_METERS && distanceMeters <= FIVE_K_MAX_METERS;
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Season averages for one set of result rows.
 *
 * rows: [{ athleteId, timeSec, distanceMeters }]
 * Returns { avg5K, avgPace, athleteCount } — either average is null when
 * nothing in the group supports it (no 5K raced, no usable distances).
 */
function summarizeGroupSeason(rows) {
  const best5KByAthlete = new Map();
  const totals = new Map();

  for (const row of rows) {
    if (!(row.timeSec > 0) || !(row.distanceMeters > 0)) continue;

    if (isFiveK(row.distanceMeters)) {
      const current = best5KByAthlete.get(row.athleteId);
      if (current === undefined || row.timeSec < current) best5KByAthlete.set(row.athleteId, row.timeSec);
    }

    if (!totals.has(row.athleteId)) totals.set(row.athleteId, { seconds: 0, miles: 0 });
    const athleteTotals = totals.get(row.athleteId);
    athleteTotals.seconds += row.timeSec;
    athleteTotals.miles += row.distanceMeters / 1609.34;
  }

  const totalSeconds = [...totals.values()].reduce((sum, t) => sum + t.seconds, 0);
  const totalMiles = [...totals.values()].reduce((sum, t) => sum + t.miles, 0);

  return {
    athleteCount: totals.size,
    avg5K: average([...best5KByAthlete.values()]),
    avgPace: totalMiles > 0 ? totalSeconds / totalMiles : null,
  };
}

/**
 * Build the chart's rows.
 *
 * rows: [{ athleteId, gender, season, timeSec, distanceMeters }] — every
 * finished result the team recorded in the seasons of interest.
 *
 * Returns one entry per season, oldest first, in the shape the chart
 * consumes. The athlete's own numbers are computed from the same rows, so
 * the line they are compared against can't be measured differently from
 * the line itself.
 */
function buildCareerComparison(rows, athleteId) {
  const bySeason = new Map();
  for (const row of rows || []) {
    if (!bySeason.has(row.season)) bySeason.set(row.season, []);
    bySeason.get(row.season).push(row);
  }

  return [...bySeason.keys()]
    .sort((a, b) => a - b)
    .map((season) => {
      const seasonRows = bySeason.get(season);
      const athlete = summarizeGroupSeason(seasonRows.filter((r) => r.athleteId === athleteId));
      const team = summarizeGroupSeason(seasonRows);
      const boys = summarizeGroupSeason(seasonRows.filter((r) => r.gender === 'M'));
      const girls = summarizeGroupSeason(seasonRows.filter((r) => r.gender === 'F'));

      return {
        season,
        athlete5K: athlete.avg5K,
        athletePace: athlete.avgPace,
        team5K: team.avg5K,
        teamPace: team.avgPace,
        boys5K: boys.avg5K,
        boysPace: boys.avgPace,
        girls5K: girls.avg5K,
        girlsPace: girls.avgPace,
        // How many athletes each average stands on. A "boys average" of
        // one is that athlete's own line drawn twice, and the chart drops
        // a series rather than pretending otherwise.
        counts: { team: team.athleteCount, boys: boys.athleteCount, girls: girls.athleteCount },
      };
    });
}

module.exports = {
  FIVE_K_MIN_METERS,
  FIVE_K_MAX_METERS,
  isFiveK,
  summarizeGroupSeason,
  buildCareerComparison,
  paceSecPerMile,
};
