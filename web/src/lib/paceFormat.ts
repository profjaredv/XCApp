// Formatting for pace ZONES, which are ranges. formatUtils' formatPace
// handles a single pace; these two are about how a range reads.

import { formatPace } from './formatUtils';
import type { ResolvedPace, PaceZoneDefinition } from './paceZones';

const METERS_PER_MILE = 1609.34;

/** "6:25 - 6:55/mi", or a single pace when both ends agree. */
export function formatPaceRange(paces: ResolvedPace): string {
  if (paces.isSinglePace) return formatPace(paces.fastSecPerMile);
  // Only the slow end carries the "/mi" — repeating it on both reads as
  // two separate paces rather than one range.
  const fast = formatPace(paces.fastSecPerMile).replace('/mi', '');
  return `${fast} - ${formatPace(paces.slowSecPerMile)}`;
}

// Distances a coach names out loud. Anything else falls back to plain
// meters, which is honest rather than pretending 3218m is "3218m race".
const NAMED_DISTANCES: Array<{ meters: number; label: string }> = [
  { meters: 400, label: '400m' },
  { meters: 800, label: '800m' },
  { meters: 1200, label: '1200m' },
  { meters: 1600, label: 'mile' },
  { meters: 1609, label: 'mile' },
  { meters: 3000, label: '3K' },
  { meters: 3200, label: '2 mile' },
  { meters: 3218, label: '2 mile' },
  { meters: 5000, label: '5K' },
  { meters: 6000, label: '6K' },
  { meters: 8000, label: '8K' },
  { meters: 10000, label: '10K' },
];

export function distanceLabel(meters: number): string {
  const named = NAMED_DISTANCES.find((d) => d.meters === meters);
  if (named) return named.label;
  if (meters % 1000 === 0) return `${meters / 1000}K`;
  return `${meters}m`;
}

/** "+2:00" / "-0:45" / "even" — an offset, signed, as a coach writes it. */
export function formatOffset(seconds: number): string {
  if (seconds === 0) return 'even';
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * The rule in one line, in the coach's own terms — "2 mile to 5K race
 * pace", "mile pace +2:00 to +3:00". Shown next to the computed pace so
 * nobody has to trust a number whose derivation is invisible.
 */
export function describeRule(zone: PaceZoneDefinition): string {
  if (zone.ruleType === 'RANGE') {
    if (zone.rangeDistanceAMeters == null || zone.rangeDistanceBMeters == null) return 'Incomplete rule';
    // Shorter distance first: that is the faster end, and it matches the
    // order resolvePaceZone returns.
    const [a, b] = [zone.rangeDistanceAMeters, zone.rangeDistanceBMeters].sort((x, y) => x - y);
    return `${distanceLabel(a)} to ${distanceLabel(b)} race pace`;
  }
  if (zone.refDistanceMeters == null || zone.offsetFastSec == null || zone.offsetSlowSec == null) {
    return 'Incomplete rule';
  }
  const ref = `${distanceLabel(zone.refDistanceMeters)} pace`;
  if (zone.offsetFastSec === zone.offsetSlowSec) return `${ref} ${formatOffset(zone.offsetFastSec)}`;
  return `${ref} ${formatOffset(zone.offsetFastSec)} to ${formatOffset(zone.offsetSlowSec)}`;
}

/** Seconds for one rep of `meters` at a given per-mile pace. */
export function repTimeSec(paceSecPerMile: number, meters: number): number {
  return paceSecPerMile * (meters / METERS_PER_MILE);
}

/**
 * A rep target, to the whole second: "1:17".
 *
 * Deliberately NOT formatUtils' formatTime, which carries a tenth. A tenth
 * is right for a time somebody actually ran on a stopwatch; on a target
 * estimated from an equivalent-performance model it is false precision,
 * and "1:17.4-1:20.7" is also just harder to read off a phone at the track
 * than "1:17-1:21".
 */
export function formatRepTime(seconds: number): string {
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Is this zone one an athlete runs as REPEATS on a track, rather than as a
 * continuous run? Only the former wants per-distance split targets.
 *
 * Measured against the athlete's own 5K pace rather than an absolute
 * cutoff. An absolute one (say "faster than 7:30/mi") quietly denies rep
 * targets to every slower athlete on the team — a 25:00 5K runner's real
 * interval pace is around 7:30/mi, and they need the splits as much as
 * anyone. Relative to their own race pace, the same rule works for the
 * whole roster.
 */
const REP_ZONE_MAX_SEC_SLOWER_THAN_5K = 60;

export function isRepeatZone(zoneFastSecPerMile: number, fiveKPaceSecPerMile: number): boolean {
  return zoneFastSecPerMile <= fiveKPaceSecPerMile + REP_ZONE_MAX_SEC_SLOWER_THAN_5K;
}
