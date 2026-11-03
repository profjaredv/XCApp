// Results Grid filter chips (F2, docs/leadpack-new-ui-trial.md §2).
//
// An EMPTY selection means "All" — no filter. Before this, "All" meant
// "every value selected", so on load the All chip and every class chip
// rendered filled at once and nobody could tell which filters were on.
// Now a chip is filled only when it was picked, and All is filled only
// when nothing is.
//
// What "All" lets through is unchanged from before: athletes with no class
// year were never shown (there's no chip that would ever select them), and
// athletes with no gender on record were shown whenever every gender was.

/** Toggle one value; picking every value collapses back to All (empty). */
export function toggleFilter<T>(selected: Set<T>, value: T, available: readonly T[]): Set<T> {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return available.length > 0 && available.every((v) => next.has(v)) ? new Set() : next;
}

export function matchesGrade(grade: number | null | undefined, selected: Set<number>): boolean {
  if (!grade) return false;
  return selected.size === 0 || selected.has(grade);
}

/** `genderKey` is the normalized key (lib/gender.ts), null when unknown. */
export function matchesGender(genderKey: string | null | undefined, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  return !!genderKey && selected.has(genderKey);
}
