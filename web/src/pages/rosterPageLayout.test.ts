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
    expect(header).toContain('w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0');
  });

  it('does NOT force buttons to full width', () => {
    // The first fix for the overflow made every action a full-width bar,
    // which turned four buttons into half a phone screen before any page
    // content. Wrapping at natural width was the actual answer.
    expect(header).not.toContain('[&>button]:w-full');
  });

  it('hides occasional setup actions behind a More toggle below sm', () => {
    expect(header).toContain('secondaryActions');
    expect(header).toContain('hidden sm:contents');
    expect(header).toContain('className="sm:hidden"');
    expect(header).toContain('flex w-full flex-wrap gap-2 sm:hidden');
  });

  it('keeps the toggle out of the way entirely when a page has no secondary actions', () => {
    expect(header).toContain('{secondaryActions && (');
  });
});

describe('roster header on a phone', () => {
  it('keeps only Add athlete visible — the thing a coach came to do', () => {
    const primary = roster.slice(roster.indexOf('actions={'), roster.indexOf('secondaryActions={'));
    expect(primary).toContain('Add athlete');
    expect(primary).not.toContain('Sync from Athletic.net');
    expect(primary).not.toContain('Import Roster');
    expect(primary).not.toContain('Merge Duplicates');
  });

  it('puts sync, import and merge behind More', () => {
    const secondary = roster.slice(roster.indexOf('secondaryActions={'));
    for (const action of ['Sync from Athletic.net', 'Import Roster', 'Merge Duplicates']) {
      expect(secondary).toContain(action);
    }
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

describe('roster row hierarchy', () => {
  it('renders each status badge exactly once per row', () => {
    // Captain appeared twice on the same row: once beside the name, once
    // in the action row that was added when admin actions moved out.
    // Counted on the render conditions rather than the label text, which
    // also appears in the prose explaining why this happened.
    expect((roster.match(/\{athlete\.isCaptain &&/g) ?? []).length).toBe(1);
    expect((roster.match(/\{athlete\.graduated &&/g) ?? []).length).toBe(1);
    expect((roster.match(/\{!athlete\.graduationYear &&/g) ?? []).length).toBe(1);
    expect((roster.match(/\{athlete\.flaggedForRemoval &&/g) ?? []).length).toBe(1);
  });

  it('makes the name the largest thing on the row', () => {
    expect(roster).toContain('text-base font-semibold leading-tight sm:text-lg');
  });

  it('steps the badges down so they annotate the name rather than rival it', () => {
    expect(roster).toContain("const ROW_BADGE = 'px-1.5 py-0 text-[10px] font-medium'");
    // Including the group chips, which sit directly under the name.
    expect(roster).toContain('${ROW_BADGE} font-normal');
  });

  it('keeps the name flexible against the action column', () => {
    expect(roster).toContain('<div className="min-w-0 flex-1">');
    expect(roster).toContain('<div className="flex shrink-0 flex-wrap items-center gap-2">');
  });
});
