// Display for a TrackResult.markValue. The stored number means nothing
// without its event's unit (seconds, or total inches for US field events),
// so every screen formats through here rather than printing the number.

export type MarkUnit = 'SECONDS' | 'METERS' | 'FEET_INCHES' | 'POINTS';

export function formatMark(value: number | null | undefined, unit: MarkUnit | string): string {
  if (value == null || !Number.isFinite(value)) return '';
  if (unit === 'FEET_INCHES') {
    // Work in hundredths of an inch so 11.999 rolls into the next foot.
    const hundredths = Math.round(value * 100);
    const feet = Math.floor(hundredths / 1200);
    const inches = (hundredths - feet * 1200) / 100;
    return `${feet}' ${Number.isInteger(inches) ? inches : inches.toFixed(2).replace(/0$/, '')}"`;
  }
  if (unit === 'SECONDS') {
    const hundredths = Math.round(value * 100);
    const minutes = Math.floor(hundredths / 6000);
    const seconds = (hundredths - minutes * 6000) / 100;
    return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, '0')}` : seconds.toFixed(2);
  }
  if (unit === 'METERS') return `${value.toFixed(2)}m`;
  return String(Math.round(value));
}

const STATUS_LABEL: Record<string, string> = { DNS: 'DNS', DNF: 'DNF', DQ: 'DQ', NM: 'No mark', ENTERED: 'Entered' };

/** A result's mark, or its status when it has none. */
export function formatResult(r: { markValue: number | null; status: string }, unit: string): string {
  return r.status === 'FINISHED' ? formatMark(r.markValue, unit) : STATUS_LABEL[r.status] ?? r.status;
}

export function formatMeetDate(iso: string): string {
  // Meet dates are calendar dates stored at UTC midnight; format in UTC so
  // a west-coast browser doesn't show the day before.
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
