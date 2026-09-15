import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Roster page layout, from a phone screenshot: the header actions ran off
// the right edge, the page carried a second season picker labelled
// differently from the one in the app header, and team-setup cards sat
// above the roster list.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const roster = code(read('pages/RosterPage.tsx'));
const header = code(read('components/PageHeader.tsx'));
const settings = code(read('pages/SettingsPage.tsx'));
const layout = code(read('components/Layout.tsx'));

describe('page header actions on a phone', () => {
  it('lets the actions block shrink and wrap instead of overflowing the screen', () => {
    // shrink-0 plus a fixed-width control inside meant a long action
    // ("Sync from Athletic.net") ran off the right edge rather than
    // wrapping onto its own line.
    expect(header).not.toContain('flex shrink-0 flex-wrap gap-2');
    expect(header).toContain('w-full flex-wrap gap-2 sm:w-auto sm:shrink-0');
  });
});

describe('one season picker, not two', () => {
  it('the roster page no longer renders its own', () => {
    // Layout's header picker and this one wrote the SAME SeasonContext,
    // so the screen showed one season twice under two different words.
    expect(roster).not.toContain('<SelectValue placeholder="Season" />');
    expect(roster).not.toContain("s.isActive ? ' (Active)' : ''");
  });

  it('the app header keeps the one that stays', () => {
    expect(layout).toContain("' (Current)'");
  });

  it('the roster still reads the shared selection rather than its own state', () => {
    expect(roster).toContain('const { seasons, activeYear } = useSeasonSelection()');
  });
});

describe('team setup moved off the roster', () => {
  it('the join code and claim cards are gone from the roster page', () => {
    expect(roster).not.toContain('Team Join Code');
    expect(roster).not.toContain('PendingClaimsCard');
    expect(roster).not.toContain('handleGenerateJoinCode');
  });

  it('they live in Settings under one section', () => {
    expect(settings).toContain('title="Athlete access"');
    expect(settings).toContain('<TeamJoinCodeCard />');
    expect(settings).toContain('<PendingClaimsCard />');
    expect(settings).toContain('<PendingGuardianLinksCard />');
    expect(settings).toContain('<PendingParentRequestsCard />');
  });
});

describe('preview as athlete', () => {
  it('is back on the roster row — it is reached FROM the list, not from a profile', () => {
    expect(roster).toContain('setPreviewAthlete(athlete.id, athlete.preferredName || athlete.name, teamPath)');
    expect(roster).toContain('Preview as athlete');
  });

  it('stays icon-only so the row does not go back to wrapping', () => {
    const anchor = roster.indexOf('onClick={() => setPreviewAthlete(');
    const button = roster.slice(Math.max(0, anchor - 500), anchor + 200);
    expect(button).toContain('h-9 w-9 shrink-0 p-0');
  });

  it('did not bring the rest of the admin buttons back with it', () => {
    for (const gone of ['Make Captain', 'Add Nickname', 'Set class year', 'openInviteDialog']) {
      expect(roster).not.toContain(gone);
    }
  });
});
