// Shared with the backend's own isRankableFinish/compareByFinishTime
// (lib/raceResults.js) — not imported directly (frontend/backend don't
// share a module graph), just kept in lockstep by hand. Exists because
// "entries with 0:00 were showing up as top runners": a DNS/DNF/DQ row
// can carry a leftover nonzero time from before it was marked a
// non-finish (see backend lib/raceResults.js's decideResultWrite), so
// checking `time` alone — even `time != null` — isn't enough anywhere
// results get ranked or sorted by time.

interface RankableRow {
  time: number | null;
  status?: string;
}

/** A row only counts as a real, rankable time when it's a genuine finish
 * — status FINISHED and a positive time. */
export function isRankableFinish<T extends RankableRow>(r: T): r is T & { time: number } {
  return r.status === 'FINISHED' && typeof r.time === 'number' && r.time > 0;
}

/** Fastest-to-slowest; anyone who isn't a rankable finish (see above)
 * sorts to the end, in whatever order they were already in. */
export function compareByFinishTime<T extends RankableRow>(a: T, b: T): number {
  const aOk = isRankableFinish(a);
  const bOk = isRankableFinish(b);
  if (aOk && bOk) return (a.time as number) - (b.time as number);
  if (aOk) return -1;
  if (bOk) return 1;
  return 0;
}
