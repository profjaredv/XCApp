// Whether a result in one specific race was this athlete's personal
// record, or their season best, AT THE DISTANCE that race was run.
// Scoped to one distance on purpose — course difficulty and distance
// both bend finish time, and only same-distance times are safe to rank
// against each other at all. lib/courseDifficulty.js's adjustedTimeSec
// carries the same warning going the other direction: "only meaningful
// against another race at the SAME distance."
//
// "PR" means: as of this race's date, nothing else on this athlete's
// record at this distance was faster. It does not change retroactively —
// a result that WAS a PR the day it was run stays flagged that way even
// after a faster one comes along later, the same way a trophy isn't
// revoked. "Season best" is the same idea, scoped to one season.

// rows: every FINISHED result one athlete has ever posted at ONE
// distance — [{ raceId, time, date, season }] — including the race(s)
// being evaluated. Order doesn't matter, this sorts by date itself.
//
// Returns a Map<raceId, { pr: boolean, seasonBest: boolean }> — every
// raceId present in `rows` gets an entry, so a caller can look up any of
// them, not just one. Two rows sharing an exact tied time both count:
// the second one merely equals the standing best, it doesn't miss it.
function computePrFlagsByRace(rows) {
  const sorted = [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const flagsByRaceId = new Map();
  let careerBest = Infinity;
  const seasonBestSoFar = new Map();

  for (const row of sorted) {
    const seasonRunning = seasonBestSoFar.get(row.season) ?? Infinity;
    const flags = {
      pr: row.time <= careerBest,
      seasonBest: row.time <= seasonRunning,
    };
    // A later row for the same raceId (shouldn't happen — one result per
    // athlete per race — but two rows can legitimately share a raceId if
    // a caller passes duplicates) overwrites with the flags computed at
    // its own position in the sort, not the first one seen.
    flagsByRaceId.set(row.raceId, flags);
    careerBest = Math.min(careerBest, row.time);
    seasonBestSoFar.set(row.season, Math.min(seasonRunning, row.time));
  }

  return flagsByRaceId;
}

module.exports = { computePrFlagsByRace };
