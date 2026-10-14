import type { GroupDay } from '@/api/groupService';

// The group row's primary action on next Today (docs/leadpack-new-ui-trial.md
// §4.1) and the group page (§4.3): Take attendance until it's taken, then
// Start interval session if one is planned, otherwise Open group.
export function groupAction(day: GroupDay | undefined, teamPath: (p: string) => string): { label: string; to: string } {
  if (!day) return { label: 'Open group', to: '' };
  const marked = day.members.length - day.counts.unmarked;
  const attendanceTaken = !!day.session && marked > 0;
  if (day.attendanceEnabled && !attendanceTaken && day.members.length > 0) {
    return { label: 'Take attendance', to: teamPath(`/group/${day.group.id}`) };
  }
  if (day.intervalSessions.length > 0) {
    return { label: 'Start interval session', to: teamPath(`/interval-sessions/${day.intervalSessions[0].id}`) };
  }
  return { label: 'Open group', to: teamPath(`/group/${day.group.id}`) };
}

