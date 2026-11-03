import { formatTime } from './formatUtils';

// F5 (docs/leadpack-new-ui-trial.md §2): season-best and PR metrics are
// only computed for 5K (AthleteSeasonMetrics.bestTime5k — see
// calculationService's fiveKRaces), so their "SB 5K" / "PR 5K" labels are
// right — but only when there IS a 5K. Without one the value is 0 or null,
// which rendered as "0:00.0" under a 5K label. Every place that shows one
// of these goes through here instead.

export const NO_5K = 'No 5K yet';

// Same tolerance the backend uses to decide a race is a 5K
// (calculationService: |distance - 3.1| < 0.05 miles).
const FIVE_K_MILES = 3.1;
const TOLERANCE_MILES = 0.05;

export function isFiveK(distanceMiles: number | null | undefined): boolean {
  return typeof distanceMiles === 'number' && Math.abs(distanceMiles - FIVE_K_MILES) < TOLERANCE_MILES;
}

/** A 5K time, or "No 5K yet" when there isn't one. */
export function formatFiveK(seconds: number | null | undefined): string {
  return seconds && seconds > 0 ? formatTime(seconds) : NO_5K;
}

/** The fastest race that really is a 5K, or null. */
export function bestFiveK<T extends { distanceMi: number; time: number }>(races: readonly T[]): T | null {
  let best: T | null = null;
  for (const race of races) {
    if (!isFiveK(race.distanceMi) || !(race.time > 0)) continue;
    if (!best || race.time < best.time) best = race;
  }
  return best;
}
