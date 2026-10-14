// A meet series across years (docs/leadpack-new-ui-trial.md §4.6 History):
// the same meet, season by season, as team-level aggregates only. Pure — the
// route loads races and results, this decides what leaves the server.
//
// Rules this exists to keep:
//   - Never compare across different distances. Rows are one per season
//     AND distance; a row is compared only with the most recent earlier
//     season run at the same distance. A row with no distance on record is
//     never compared.
//   - No per-athlete rows. Finisher counts and averages by gender only. The
//     one exception is the requesting athlete's own result, which they can
//     already see everywhere else.

const { isRankableFinish } = require('./raceResults');
const { normalizeGender } = require('./gender');

// Two races are "the same distance" within 1% — 5000m vs 5000.0 vs a
// scraper's 4999.9, never 5K vs 3 miles (3.4% apart).
function sameDistance(a, b) {
  if (!a || !b) return false;
  return Math.abs(a - b) / Math.max(a, b) <= 0.01;
}

function average(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/**
 * @param races [{ id, season, date, name, distance, distanceMeters,
 *                 results: [{ athleteId, time, status, gender }] }]
 * @param opts  { viewerAthleteId?: string | null }
 */
function buildSeriesHistory(races, { viewerAthleteId = null } = {}) {
  const buckets = new Map();
  for (const race of races) {
    const meters = race.distanceMeters ? Math.round(race.distanceMeters) : null;
    const key = `${race.season}|${meters ?? 'none'}`;
    if (!buckets.has(key)) {
      buckets.set(key, { season: race.season, distanceMeters: meters, distanceLabel: race.distance ?? null, races: [] });
    }
    buckets.get(key).races.push(race);
  }

  const rows = [...buckets.values()].map((b) => {
    const finishes = b.races.flatMap((r) => r.results.filter(isRankableFinish).map((res) => ({ ...res, raceId: r.id })));
    const bySex = {};
    for (const sex of ['M', 'F']) {
      const times = finishes.filter((f) => normalizeGender(f.gender) === sex).map((f) => f.time);
      bySex[sex] = { finishers: times.length, avgSec: average(times) };
    }
    const mine = viewerAthleteId ? finishes.find((f) => f.athleteId === viewerAthleteId) ?? null : null;
    return {
      season: b.season,
      distanceMeters: b.distanceMeters,
      distanceLabel: b.distanceLabel,
      date: b.races.map((r) => r.date).sort()[0] ?? null,
      raceIds: b.races.map((r) => r.id),
      finishers: finishes.length,
      bySex,
      mine: mine ? { raceId: mine.raceId, timeSec: mine.time } : null,
    };
  });

  rows.sort((a, b) => b.season - a.season || (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));

  // Compare each row with the most recent EARLIER season at the same distance.
  for (const row of rows) {
    const prior = rows.find((r) => r.season < row.season && sameDistance(r.distanceMeters, row.distanceMeters));
    row.comparedTo = prior
      ? {
          season: prior.season,
          deltaSec: {
            M: row.bySex.M.avgSec != null && prior.bySex.M.avgSec != null ? row.bySex.M.avgSec - prior.bySex.M.avgSec : null,
            F: row.bySex.F.avgSec != null && prior.bySex.F.avgSec != null ? row.bySex.F.avgSec - prior.bySex.F.avgSec : null,
          },
        }
      : null;
  }
  return rows;
}

module.exports = { buildSeriesHistory, sameDistance };
