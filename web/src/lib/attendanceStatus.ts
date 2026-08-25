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

export function nextAttendanceStatus(status: AttendanceStatus): AttendanceStatus {
  const i = ATTENDANCE_STATUS_CYCLE.indexOf(status);
  return ATTENDANCE_STATUS_CYCLE[(i + 1) % ATTENDANCE_STATUS_CYCLE.length];
}
