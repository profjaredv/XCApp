// Season > Meets: a meet card's heats, grouped by the distance they ran.
//
// GET /analytics/overview now returns one entry per MEET rather than one
// per race (backend lib/meetMapping.js), so a meet where the team ran two
// distances is a single card instead of two look-alike cards. That makes
// the distances the thing a coach has to choose between, because pooling
// them is not an option: "Analyze Meet" builds IQR bands and rankings out
// of raw finishing TIMES, and a 3200m time next to a 5K time is not a
// slower runner, it is a different race.
//
// Average PACE is comparable across distances, which is why the card's
// headline pace still spans the whole meet — only the analysis pool is
// scoped to one distance.

import { distanceLabel } from './resultsGridColumns';

export interface MeetHeat {
  id: string;
  name: string;
  distance?: number | null;
  runners: number;
  avgPace: number;
  hasSplits: boolean;
}

export interface HeatDistanceGroup<T extends MeetHeat> {
  /** Null when the heats in this group have no recorded distance. */
  distance: number | null;
  label: string;
  heats: T[];
  /** Summed across the heats at this distance. */
  runners: number;
  /** Field-size weighted, the same way the backend combines a whole meet. */
  avgPace: number;
  hasSplits: boolean;
}

/**
 * Groups a meet's heats by distance, in the order the distances first
 * appear. Same-distance heats (a race run in waves) stay together — their
 * times are directly comparable, which is the whole test for pooling.
 * Nothing is dropped: every heat lands in exactly one group.
 */
export function groupHeatsByDistance<T extends MeetHeat>(heats: T[]): Array<HeatDistanceGroup<T>> {
  const byKey = new Map<string, HeatDistanceGroup<T>>();
  for (const heat of heats) {
    const distance = heat.distance ?? null;
    const key = distance == null ? 'unknown' : String(Math.round(distance));
    const existing = byKey.get(key);
    if (existing) {
      existing.heats.push(heat);
    } else {
      byKey.set(key, {
        distance,
        label: distanceLabel(distance),
        heats: [heat],
        runners: 0,
        avgPace: 0,
        hasSplits: false,
      });
    }
  }

  return [...byKey.values()].map((group) => {
    const runners = group.heats.reduce((sum, h) => sum + (h.runners || 0), 0);
    const weightedPaceSum = group.heats.reduce((sum, h) => sum + (h.avgPace || 0) * (h.runners || 0), 0);
    return {
      ...group,
      runners,
      avgPace: runners > 0 ? weightedPaceSum / runners : group.heats[0].avgPace || 0,
      hasSplits: group.heats.some((h) => h.hasSplits),
    };
  });
}

/**
 * True only when a meet actually ran more than one distance — the single
 * case that earns a toggle row on the card. Heats of one distance need no
 * picker: they analyze as one race, which is what they are.
 */
export function hasMultipleDistances<T extends MeetHeat>(heats: T[] | undefined): boolean {
  if (!heats || heats.length < 2) return false;
  return groupHeatsByDistance(heats).length > 1;
}
