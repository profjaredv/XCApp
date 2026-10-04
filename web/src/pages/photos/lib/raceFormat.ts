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

/** Prefers the race's own label ("5K") over a bare meters figure. */
export function formatDistance(distanceLabel: string | null, distanceMeters: number | null): string {
  if (distanceLabel) return distanceLabel;
  if (distanceMeters == null) return '';
  const miles = distanceMeters / 1609.34;
  return `${miles.toFixed(1)}mi`;
}

/** 142.3 -> "142.3 mi". Whole numbers skip the decimal ("12 mi", not "12.0 mi"). */
export function formatMiles(miles: number): string {
  return `${Number.isInteger(miles) ? miles : miles.toFixed(1)} mi`;
}
