import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Per-athlete admin moved off the roster row and onto the athlete's own
// page. The roster row carried up to nine buttons per athlete, which
// wrapped onto three lines on a phone and pushed the actual roster off
// the screen.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const panel = code(read('components/athletes/AthleteAdminPanel.tsx'));
const roster = code(read('pages/RosterPage.tsx'));
const modal = code(read('components/analytics/AthleteDetailModal.tsx'));
const chart = code(read('components/analytics/AthleteProgressChart.tsx'));
const profilePage = code(read('pages/TeamAthleteProfilePage.tsx'));

describe('athlete admin panel', () => {
  it('carries every per-athlete action the roster row used to have', () => {
    for (const action of ['nickname', 'class year', 'captain', 'Captain notes', 'invite', 'Preview as', 'Remove from']) {
      expect(panel.toLowerCase()).toContain(action.toLowerCase());
    }
  });

  it('shares the roster query key, so a change here shows up there without a refetch dance', () => {
    expect(panel).toContain("queryKey: ['roster', season]");
    expect(panel).toContain("queryClient.invalidateQueries({ queryKey: ['roster'] })");
  });

  it('stores a class year, not a grade — a grade would be wrong next season', () => {
    expect(panel).toContain('graduationYear: season + (12 - grade)');
  });

  it('says so plainly when the athlete is not on this season\'s roster', () => {
    expect(panel).toContain("isn't on the {season} roster");
  });
});

describe('roster row after the move', () => {
  it('keeps status badges and the way in, and nothing else per athlete', () => {
    expect(roster).toContain('View Profile');
    expect(roster).toContain('Needs class year');
    // Status lives on the name line; the action row carries actions only,
    // which is what stopped Captain rendering twice on one row.
    const actionRow = roster.slice(roster.indexOf('<div className="flex shrink-0 flex-wrap items-center gap-2">'));
    expect(actionRow.slice(0, 400)).not.toContain('<Badge');
  });

  it('no longer carries the per-athlete action buttons', () => {
    expect(roster).not.toContain('Make Captain');
    expect(roster).not.toContain('Add Nickname');
    expect(roster).not.toContain('Set class year');
    expect(roster).not.toContain('openInviteDialog');
  });

  it('left no orphaned dialog or mutation behind that nothing can reach', () => {
    for (const dead of ['nicknameTarget', 'classYearTarget', 'captainNotesTarget', 'inviteDialogOpen', 'saveNickname']) {
      expect(roster).not.toContain(dead);
    }
  });
});

describe('admin tab placement', () => {
  it('lives inside the modal, which is what actually covers the screen', () => {
    expect(modal).toContain('<AthleteAdminPanel athleteId={selectedAthlete!.id} season={adminSeason!} />');
    expect(profilePage).toContain('adminSeason={selectedSeason}');
  });

  it('is coach-only, and absent entirely when no season is in hand', () => {
    expect(modal).toContain("currentUser?.role === 'coach' && adminSeason != null");
    expect(modal).toContain('{showAdmin && <TabsTrigger value="admin"');
  });
});

describe('athlete name on the profile', () => {
  it('reads identity first — the metrics endpoint had no athleteName field at all', () => {
    // The blank name is what made the heading vanish and the chart legend
    // fall through to its dataKey, rendering "athlete5K" at the coach.
    expect(profilePage).toContain('const identityName = athleteIdentity?.preferredName || athleteIdentity?.name');
    expect(profilePage).toContain('const displayName = identityName || data.athleteName');
  });

  it('rebuilds first/last from the resolved name, not from the missing field', () => {
    expect(profilePage).not.toContain("data.athleteName?.split(' ')[0]");
    expect(profilePage).toContain("displayName.split(' ')[0]");
  });

  it('never lets a chart legend leak a raw dataKey again', () => {
    expect(chart).toContain("const FALLBACK_SERIES_NAME = 'This athlete'");
    expect(chart).not.toContain('name={athleteName}');
    expect(chart).toContain('name={athleteName || FALLBACK_SERIES_NAME}');
  });
});
