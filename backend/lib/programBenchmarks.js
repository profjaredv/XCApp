// What to measure a season against.
//
// This file used to return { league: null, state: null, national: null }
// for everything, on the honest grounds that no such reference data exists
// anywhere in this app — no benchmark table, no ingestion, nothing. That
// was right not to fabricate, but it left the Program screen with no
// yardstick at all and a permanent notice explaining the absence.
//
// A program has a yardstick already: its own best season. "The largest
// roster you've had", "the fastest your boys have been", "the tightest
// your pack has run" are facts about this team, computed from data it
// owns, and they are the comparison a coach actually makes.
//
// Three rules:
//
//   1. Only ever from the team's own seasons. Nothing external is invented.
//   2. A best needs something to be best OF. One season on file is not a
//      record, it is the only reading, and this says so (`seasonsCompared`)
//      rather than crowning it.
//   3. Direction is explicit per metric. Bigger is better for a roster;
//      smaller is better for a pace and for a pack spread. Getting that
//      backwards would celebrate a program's worst year.

/** A single season is the only reading, not a record. */
const MIN_SEASONS_FOR_BEST = 2;

const METRICS = [
  { key: 'rosterSize', label: 'Roster', direction: 'higher', unit: 'athletes' },
  { key: 'racedCount', label: 'Athletes racing', direction: 'higher', unit: 'athletes' },
  { key: 'raceMiles', label: 'Race miles', direction: 'higher', unit: 'miles' },
  { key: 'medianPaceMen', label: "Boys' median pace", direction: 'lower', unit: 'sec/mi' },
  { key: 'medianPaceWomen', label: "Girls' median pace", direction: 'lower', unit: 'sec/mi' },
  { key: 'packSpreadMen', label: "Boys' pack spread", direction: 'lower', unit: 'sec' },
  { key: 'packSpreadWomen', label: "Girls' pack spread", direction: 'lower', unit: 'sec' },
];

/** Pull one metric's value out of a merged season row, or null if it has none. */
function valueFor(season, key) {
  switch (key) {
    case 'rosterSize':
      return season.participants?.total ?? null;
    case 'racedCount':
      return season.racedCount ?? null;
    case 'raceMiles':
      return season.raceMiles ?? null;
    case 'medianPaceMen':
      return season.medianPace?.men?.paceSecPerMile ?? null;
    case 'medianPaceWomen':
      return season.medianPace?.women?.paceSecPerMile ?? null;
    case 'packSpreadMen':
      return season.packSpread?.men?.spreadSec ?? null;
    case 'packSpreadWomen':
      return season.packSpread?.women?.spreadSec ?? null;
    default:
      return null;
  }
}

/**
 * The program's own best, per metric.
 *
 * @param seasons merged per-season rows (participants + the live shapes)
 * @returns { [metricKey]: { value, season, label, direction, unit, seasonsCompared, isCurrent } }
 *          — absent entirely for a metric no season has data for, so a
 *          caller never has to distinguish "no best" from "best of nothing".
 */
function buildSelfBenchmarks(seasons) {
  const rows = seasons || [];
  const latestSeason = rows.length > 0 ? rows[rows.length - 1].season : null;
  const best = {};

  for (const metric of METRICS) {
    const observed = rows
      .map((season) => ({ season: season.season, value: valueFor(season, metric.key) }))
      .filter((entry) => typeof entry.value === 'number' && Number.isFinite(entry.value));

    if (observed.length === 0) continue;

    const winner = observed.reduce((currentBest, entry) => {
      if (currentBest === null) return entry;
      const better = metric.direction === 'lower' ? entry.value < currentBest.value : entry.value > currentBest.value;
      return better ? entry : currentBest;
    }, null);

    best[metric.key] = {
      ...winner,
      label: metric.label,
      direction: metric.direction,
      unit: metric.unit,
      // How many seasons actually had a number for this metric — a "best"
      // out of one is the only reading there is.
      seasonsCompared: observed.length,
      isRecord: observed.length >= MIN_SEASONS_FOR_BEST,
      isCurrent: winner.season === latestSeason,
    };
  }

  return best;
}

// Kept so nothing that imports it breaks: there is still no league, state
// or national reference data anywhere in this app, and this returning
// nulls is the truthful answer rather than a placeholder number.
function getBenchmark(_season, _gender) {
  return { league: null, state: null, national: null };
}

module.exports = { METRICS, MIN_SEASONS_FOR_BEST, valueFor, buildSelfBenchmarks, getBenchmark };
