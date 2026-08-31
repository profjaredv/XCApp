export const formatTime = (seconds: number): string => {
  if (seconds <= 0) return '0:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
};

// A training-run duration, as a runner would say it: "48:12", "1:30:00".
//
// Distinct from formatTime above, which formats a RACE time — tenths of a
// second matter there and nothing is ever an hour long, so it renders 5400
// seconds as "90:00.0". For a long run that is simply wrong-looking; this
// rolls hours over and drops the tenths.
export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
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

// No dedicated lastName column exists anywhere in the schema — names are
// stored as one combined field. Last whitespace-separated token, for
// sorting a roster the way a physical sheet is alphabetized (Attendance
// take-page). A single-word name sorts on that word.
export const lastNameOf = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
};

// The Monday on or before a "YYYY-MM-DD" date, as the same string shape —
// used by AttendancePage's weekly grid to anchor a week, and by
// AttendanceSessionPage to link back to the week a given day belongs to.
export const mondayOf = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
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

// TODAY, in the viewer's own timezone.
//
// `new Date().toISOString().slice(0, 10)` — which this codebase used in a
// dozen places — is the UTC date, not the local one. For a US coach (UTC-5
// to -8) those disagree every evening: at 6pm Pacific it is already
// tomorrow in UTC, so "today's practice" silently became tomorrow's, and a
// date-defaulted form (new meet, duplicate session, log a run) pre-filled
// the wrong day. Built from the local getFullYear/getMonth/getDate parts so
// no conversion is involved at all.
export const localIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayIso = (): string => localIsoDate(new Date());
