import type { AttendanceStatus } from '@/api/attendanceService';

// Blank (ABSENT) -> Present -> Excused -> Late -> back to blank. Shared by
// StatusCell (the click-to-cycle control) and anywhere else that needs to
// label or order statuses (CSV export, print views) without duplicating
// the definition.
export const ATTENDANCE_STATUS_CYCLE: AttendanceStatus[] = ['ABSENT', 'PRESENT', 'EXCUSED', 'LATE'];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  ABSENT: 'Absent',
  PRESENT: 'Present',
  EXCUSED: 'Excused',
  LATE: 'Late',
};

// The one-character mark shown in a grid cell or on paper. Blank for
// ABSENT on purpose — an unmarked athlete is the default state, so the
// sheet reads as "who showed" rather than a wall of letters.
export const ATTENDANCE_STATUS_MARK: Record<AttendanceStatus, string> = {
  ABSENT: '',
  PRESENT: '✓',
  EXCUSED: 'E',
  LATE: 'L',
};

// Colors carry the meaning at a glance across a whole week's grid:
// green = here, amber = excused (accounted for), blue = late (here, but
// noted), dashed outline = nobody has said anything yet. Deliberately
// separated hues, not a warm gradient — amber-500 next to orange-500 (the
// first pass) were nearly indistinguishable side by side on a phone, and
// "excused vs late" is exactly the distinction a coach scans a column for.
export const ATTENDANCE_STATUS_CLASS: Record<AttendanceStatus, string> = {
  ABSENT: 'bg-background text-muted-foreground border-dashed border-border',
  PRESENT: 'bg-emerald-600 text-white border-emerald-600',
  EXCUSED: 'bg-amber-500 text-white border-amber-500',
  LATE: 'bg-blue-600 text-white border-blue-600',
};

// The same buttons when they are NOT the current status. Kept deliberately
// faint: at full muted-foreground an unselected "✓" read as an athlete who
// was already marked present, which is the single worst thing this control
// could get wrong.
export const ATTENDANCE_STATUS_INACTIVE_CLASS =
  'border-border bg-muted/30 text-muted-foreground/45';

export function nextAttendanceStatus(status: AttendanceStatus): AttendanceStatus {
  const i = ATTENDANCE_STATUS_CYCLE.indexOf(status);
  return ATTENDANCE_STATUS_CYCLE[(i + 1) % ATTENDANCE_STATUS_CYCLE.length];
}
