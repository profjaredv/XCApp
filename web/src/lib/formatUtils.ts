export const formatTime = (seconds: number): string => {
  if (seconds <= 0) return '0:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
};

export const formatPace = (seconds: number): string => {
  if (seconds <= 0) return '0:00/mi';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
};

// Format a date string or Date object to 'Sep 03 2024'
export const formatDateShort = (date: string | Date | undefined | null): string => {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mm = MONTHS[d.getMonth()];
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm} ${dd} ${yyyy}`;
};

// "Jared Vallejo" -> "Jared V." — for dense rosters (interval session
// grids, mobile) where a full first+last name crowds out the actual data.
// A single-word name (no last name on file) passes through unchanged.
export const compactName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last[0]}.`;
};

/**
 * Parse a MM:SS or H:MM:SS string into seconds. Returns NaN if unparseable.
 */
export const parseTimeToSeconds = (timeStr: string): number => {
  const parts = timeStr.trim().split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  }
  return NaN;
};
