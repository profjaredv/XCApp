// Turning the Results Grid's columns into "meets, with heats underneath".
//
// The season scraper names every race after its MEET — Athletic.net's
// season grid has no per-heat name, only a distance subscript per cell —
// so a meet where the team ran two distances arrives as two columns
// sharing a name. Listing them flat shows the same meet twice with nothing
// to tell them apart.
//
// Heats of the SAME distance are already merged into one column upstream
// (lib/meetMapping.js): same race run in waves, directly comparable.
// What reaches here is at most one column per distance, so a meet needs a
// toggle only when it genuinely has more than one.

export interface GridColumn {
  name: string;
  /** Identifies the meet a column belongs to, across distances. */
  meetKey: string;
  distanceMeters: number | null;
}

export interface MeetGroup<T extends GridColumn> {
  meetKey: string;
  name: string;
  /** Column indexes into the original array, in their original order. */
  columns: Array<{ index: number; column: T }>;
  /** True when this meet ran more than one distance — the only case worth a toggle. */
  hasHeats: boolean;
}

/** A distance a coach can read: 5000 → "5K", 1609 → "Mile", else "3200m". */
export function distanceLabel(meters: number | null): string {
  if (meters == null) return 'Distance unknown';
  const rounded = Math.round(meters);
  if (Math.abs(rounded - 1609) <= 2) return 'Mile';
  if (rounded % 1000 === 0) return `${rounded / 1000}K`;
  return `${rounded}m`;
}

/**
 * Groups columns by meet, preserving the order meets first appear and the
 * order of columns within each. Nothing is dropped: every column belongs
 * to exactly one group, so a grid built from these covers the same data as
 * the flat list.
 */
export function groupColumnsByMeet<T extends GridColumn>(columns: T[]): Array<MeetGroup<T>> {
  const groups = new Map<string, MeetGroup<T>>();
  columns.forEach((column, index) => {
    const existing = groups.get(column.meetKey);
    if (existing) {
      existing.columns.push({ index, column });
    } else {
      groups.set(column.meetKey, {
        meetKey: column.meetKey,
        name: column.name,
        columns: [{ index, column }],
        hasHeats: false,
      });
    }
  });
  return [...groups.values()].map((group) => ({
    ...group,
    // More than one COLUMN means more than one distance, because same-
    // distance heats were already merged upstream.
    hasHeats: group.columns.length > 1,
  }));
}
