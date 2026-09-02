import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The group day view — the screen a coach holds standing on a field.
// Everything else about groups is configuration; this is who turned up,
// what they last ran, and one button to build today's sheet from them.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/GroupDayPage.tsx'));
const groups = code(read('pages/GroupsPage.tsx'));
const router = code(read('router/index.tsx'));

describe('group day view', () => {
  it('is reachable from both places a coach looks at a group', () => {
    expect(router).toContain("path: 'group/:groupId'");
    // The cards under My Groups / Captain & Custom, and the training board
    // headers — a coach uses whichever is in front of them.
    expect(groups.match(/onOpenDay/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('shows what each athlete last ran, not just their name', () => {
    expect(page).toContain('member.lastRace');
    expect(page).toContain('formatPace(member.lastRace.paceSecPerMile)');
    expect(page).toContain('No race yet');
  });

  it('takes attendance inline, using the same picker as the attendance screens', () => {
    expect(page).toContain('AttendanceStatusPicker');
    expect(page).toContain('updateRecord.mutateAsync');
  });

  it('never creates the day session just by being opened', () => {
    // Opening a screen must not write attendance rows for the whole team;
    // a coach asks for it.
    expect(page).toContain('Take attendance');
    const openEffect = page.slice(0, page.indexOf('const handleStartAttendance'));
    expect(openEffect).not.toContain('createSession.mutate');
  });

  it('builds the interval sheet from who is actually here', () => {
    expect(page).toContain("m.status === 'PRESENT' || m.status === 'LATE'");
    expect(page).toContain('athleteIds: here.length > 0 ? here.map((m) => m.athleteId) : undefined');
  });

  it('still works for a team that turned attendance off', () => {
    // The roster and the last times are the point either way.
    expect(page).toContain('day.attendanceEnabled');
    expect(page).toContain('Attendance is turned off for this team');
  });

  it('lets a coach fix yesterday', () => {
    expect(page).toContain('addDays(date, -1)');
    expect(page).toContain('Back to today');
  });
});
