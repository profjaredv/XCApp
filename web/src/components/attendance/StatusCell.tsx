import React from 'react';
import type { AttendanceStatus } from '@/api/attendanceService';
import {
  ATTENDANCE_STATUS_CLASS,
  ATTENDANCE_STATUS_INACTIVE_CLASS,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_MARK,
  nextAttendanceStatus,
} from '@/lib/attendanceStatus';

// Two controls for the same thing, because the two places it appears have
// very different amounts of room:
//
// - AttendanceStatusCell: one tap-to-cycle circle, for the desktop week
//   grid where five of these share a row and there is space for exactly
//   one control per day.
// - AttendanceStatusPicker: three explicit buttons, for the mobile
//   one-day-at-a-time list where a full row is available. One tap sets any
//   status (cycling would take up to three), and tapping the active one
//   clears it back to blank — which matters when the coach is standing on
//   a field correcting a mis-tap, not sitting at a desk.
//
// Blank is the real default (see AttendanceRecord's schema comment), so
// neither control starts pre-selected and "didn't show" costs no taps.

export const AttendanceStatusCell: React.FC<{
  status: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
}> = ({ status, onChange, disabled }) => (
  <button
    type="button"
    title={`${ATTENDANCE_STATUS_LABEL[status]} — tap to change`}
    aria-label={ATTENDANCE_STATUS_LABEL[status]}
    disabled={disabled}
    onClick={() => onChange(nextAttendanceStatus(status))}
    className={`h-9 w-9 rounded-full border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ATTENDANCE_STATUS_CLASS[status]}`}
  >
    {ATTENDANCE_STATUS_MARK[status]}
  </button>
);

// Present / Excused / Late as three separate targets. ABSENT isn't a
// button — it's what you get by leaving all three off, or by tapping the
// active one again.
const PICKER_OPTIONS: AttendanceStatus[] = ['PRESENT', 'EXCUSED', 'LATE'];

export const AttendanceStatusPicker: React.FC<{
  status: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
}> = ({ status, onChange, disabled }) => (
  <div className="flex items-center gap-1.5">
    {PICKER_OPTIONS.map((option) => {
      const active = status === option;
      return (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={active}
          aria-label={ATTENDANCE_STATUS_LABEL[option]}
          title={ATTENDANCE_STATUS_LABEL[option]}
          onClick={() => onChange(active ? 'ABSENT' : option)}
          className={`h-11 w-11 rounded-full border text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            active ? ATTENDANCE_STATUS_CLASS[option] : ATTENDANCE_STATUS_INACTIVE_CLASS
          }`}
        >
          {ATTENDANCE_STATUS_MARK[option]}
        </button>
      );
    })}
  </div>
);
