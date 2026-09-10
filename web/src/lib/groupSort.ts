// Ordering the training-group board.
//
// Sorting by pace has one rule that matters more than the comparison
// itself: an athlete who hasn't raced yet has no pace, and must never be
// treated as a 0 — that would park every unraced freshman at the top of a
// "fastest first" board, which is the same class of bug as DNS entries
// ranking as top runners (see backend/lib/raceResults.js). They sort to
// the bottom in BOTH directions, because "no data" is not an extreme, it
// is absent.

export type GroupSortMode = 'name' | 'paceAsc' | 'paceDesc';

export interface SortableAthlete {
  name: string;
  avgPaceSecPerMile: number | null;
}

export const GROUP_SORT_LABELS: Record<GroupSortMode, string> = {
  name: 'Name (A–Z)',
  paceAsc: 'Avg pace — fastest first',
  paceDesc: 'Avg pace — slowest first',
};

const byName = (a: SortableAthlete, b: SortableAthlete) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Stable, non-mutating. Ties inside a pace sort fall back to name so the
 *  board doesn't reshuffle between renders for no visible reason. */
export function sortAthletes<T extends SortableAthlete>(athletes: T[], mode: GroupSortMode): T[] {
  const rows = [...athletes];
  if (mode === 'name') return rows.sort(byName);

  const direction = mode === 'paceAsc' ? 1 : -1;
  return rows.sort((a, b) => {
    const aPace = a.avgPaceSecPerMile;
    const bPace = b.avgPaceSecPerMile;
    if (aPace == null && bPace == null) return byName(a, b);
    if (aPace == null) return 1;
    if (bPace == null) return -1;
    if (aPace === bPace) return byName(a, b);
    return (aPace - bPace) * direction;
  });
}
