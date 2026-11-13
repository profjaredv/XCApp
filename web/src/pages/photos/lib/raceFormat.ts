// Pure formatting helpers for the running-stats block printed on a
// collage (lib/collageRender.ts) — kept separate from the canvas drawing
// code so the formatting rules themselves are unit-testable without a
// canvas.

/** 1052 -> "17:32". 3725 -> "1:02:05" (clock-style, not "62:05"). */
export function formatRaceTime(sec: number): string {
  const whole = Math.round(sec);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/**
 * The inverse of formatRaceTime — "17:32" or "1:02:05" -> seconds. Used by
 * the Build module's "edit data for print" form (components/EditStatsPanel.tsx)
 * to turn a coach's typed time back into the number every other part of
 * the collage already works in. Returns null for anything that isn't
 * cleanly m:ss or h:mm:ss (an empty field, stray text, out-of-range
 * minutes/seconds) rather than guessing.
 */
export function parseTimeToSeconds(text: string): number | null {
  const parts = text.trim().split(':');
  // The leading part (hours, or minutes if there's no hours part) may run
  // past two digits; every part after it is seconds-like — exactly 1-2
  // digits, under 60.
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] >= 60 || parts[i].length > 2) return null;
  }
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

/** Seconds-per-mile -> "7:24/mi". */
export function formatPace(secPerMile: number): string {
  return `${formatRaceTime(secPerMile)}/mi`;
}

/** An ISO date/timestamp -> "Sep 5", the compact form a results table needs. */
export function formatRaceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const MILE_IN_METERS = 1609.344;

/**
 * The back page's race-table distance column (build spec section 4): "1
 * mi", "1.5 mi", "3 mi", "4200m", or "5K" for 5000 m exactly — derived
 * purely from the meter figure, not the race's own free-text label (which
 * varies too much row to row — "2 Mile" vs "2mi" vs "2.0mi" — to print
 * consistently in a fixed-width column). Falls back to the label only when
 * meters itself is missing.
 */
export function formatRaceDistance(distanceLabel: string | null, distanceMeters: number | null): string {
  if (distanceMeters == null) return distanceLabel ?? '';
  if (distanceMeters === 5000) return '5K';
  const miles = distanceMeters / MILE_IN_METERS;
  const roundedHalfMiles = Math.round(miles * 2) / 2;
  if (roundedHalfMiles > 0 && Math.abs(miles - roundedHalfMiles) < 0.015) {
    return `${Number.isInteger(roundedHalfMiles) ? roundedHalfMiles : roundedHalfMiles.toFixed(1)} mi`;
  }
  return `${Math.round(distanceMeters)}m`;
}

/** 142.3 -> "142.3 mi". Whole numbers skip the decimal ("12 mi", not "12.0 mi"). */
export function formatMiles(miles: number): string {
  return `${Number.isInteger(miles) ? miles : miles.toFixed(1)} mi`;
}
