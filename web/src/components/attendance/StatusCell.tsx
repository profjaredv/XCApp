import React from 'react';
import type { AttendanceStatus } from '@/api/attendanceService';
import { ATTENDANCE_STATUS_LABEL, nextAttendanceStatus } from '@/lib/attendanceStatus';

// One click-to-cycle control for one athlete's status on one day, shared
// by the weekly grid (AttendancePage) and the single-day detail page
// (AttendanceSessionPage) so both surfaces behave identically. Blank is
// the actual default now (see AttendanceRecord's schema comment), so
// "didn't show" needs no click at all and the common case ("they were
// there") is a single click.
const MARK: Record<AttendanceStatus, string> = { ABSENT: '', PRESENT: '✓', EXCUSED: 'E', LATE: 'L' };
const ACTIVE_CLASS: Record<AttendanceStatus, string> = {
  ABSENT: 'bg-background text-muted-foreground border-border border-dashed',
  PRESENT: 'bg-emerald-600 text-white border-emerald-600',
  EXCUSED: 'bg-amber-500 text-white border-amber-500',
  LATE: 'bg-orange-500 text-white border-orange-500',
};

export const AttendanceStatusCell: React.FC<{
  status: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
}> = ({ status, onChange, disabled }) => (
  <button
    type="button"
    title={`${ATTENDANCE_STATUS_LABEL[status]} — click to change`}
    disabled={disabled}
    onClick={() => onChange(nextAttendanceStatus(status))}
    className={`h-8 w-8 rounded-full text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${ACTIVE_CLASS[status]}`}
  >
    {MARK[status]}
  </button>
);
