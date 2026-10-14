import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isUiVersion } from '../contexts/UiVersionContext';

// "Try the new LeadPack" — docs/leadpack-new-ui-trial.md §1.4. The router
// is the one place classic and next diverge, so its shape is pinned here:
// the chrome-bearing routes go through ShellSwitch, the full-screen tools
// stay outside it, and the new routes exist.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const router = read('router/index.tsx');

describe('UI trial router wiring', () => {
  it('wraps the team routes and /profile in ShellSwitch, and nothing in Layout directly', () => {
    expect(router.match(/element: <ShellSwitch \/>/g)?.length).toBe(2);
    expect(router).not.toMatch(/element: <Layout \/>/);
  });

  it('keeps every full-screen tool outside the shell', () => {
    const shellAt = router.indexOf("element: <ShellSwitch />,\n                children: [");
    expect(shellAt).toBeGreaterThan(-1);
    for (const p of [
      "path: 'race-visualization'",
      "path: 'interval-sessions'",
      "path: 'attendance'",
      "path: 'photos'",
      "path: 'race/:raceId/splits'",
      "path: 'race/:raceId/timer'",
    ]) {
      const at = router.indexOf(p);
      expect(at, p).toBeGreaterThan(-1);
      expect(at, `${p} must render outside the shell`).toBeLessThan(shellAt);
    }
  });

  it('routes the same-URL pages through ByUi', () => {
    for (const [p, page] of [
      ['today', 'TodayPage'],
      ['groups', 'GroupsPage'],
      ['group/:groupId', 'GroupDayPage'],
      ['meets', 'MeetsPage'],
      ['meet/:meetId', 'MeetDetailPage'],
      ['me', 'MyProgressPage'],
    ]) {
      expect(router).toMatch(new RegExp(`path: '${p.replace('/', '\\/')}',\\s+element: <ByUi classic=\\{<${page} \\/>\\}`));
    }
    expect(router).toMatch(/index: true,\s+element: <ByUi classic=\{<TodayPage \/>\}/);
  });

  it('adds train, athletes, season and groups/manage, each on its classic page for now', () => {
    expect(router).toMatch(/path: 'train',\s+element: <ByUi classic=\{<SchedulePage \/>\} next=\{<TrainPage \/>\}/);
    expect(router).toMatch(/path: 'athletes',\s+element: <RosterPage \/>/);
    expect(router).toMatch(/path: 'season',\s+element: <AnalyticsPage \/>/);
    expect(router).toMatch(/path: 'groups\/manage',\s+element: <GroupsPage \/>/);
  });

  it('leaves the classic analytics route and every legacy redirect in place', () => {
    expect(router).toMatch(/path: 'analytics',\s+element: <AnalyticsPage \/>/);
    expect(router.match(/<LegacyRedirect /g)?.length).toBeGreaterThanOrEqual(13);
  });
});

describe('UI version values', () => {
  it('accepts only the two shells', () => {
    expect(isUiVersion('classic')).toBe(true);
    expect(isUiVersion('next')).toBe(true);
    expect(isUiVersion('NEXT')).toBe(false);
    expect(isUiVersion('')).toBe(false);
    expect(isUiVersion(null)).toBe(false);
  });
});

describe('classic entry points', () => {
  it('classic shows no Try entry points while the next shell is a placeholder', () => {
    // Pulled after Jared tried the Gate 1 placeholder on a phone: classic
    // coaches should not be invited into it until §3 makes it usable.
    // ?ui=next still opts in, and TryNextCard is kept to switch back on.
    expect(read('pages/TodayPage.tsx')).not.toContain('<TryNextCard />');
    expect(read('components/Layout.tsx')).not.toContain('Try the new LeadPack');
  });

  it('the next shell has a way back from detail pages and the season picker', () => {
    const shell = read('components/next/AppShell.tsx');
    expect(shell).toContain('aria-label="Go back"');
    expect(shell).toContain('<SeasonChip />');
  });

  it('the next shell offers Switch to classic, which asks once and optionally', () => {
    expect(read('components/next/AccountMenuItems.tsx')).toContain('Switch to classic');
    const dialog = read('components/next/SwitchToClassicDialog.tsx');
    expect(dialog).toContain('What made you switch back?');
    expect(dialog).toContain('maxLength={500}');
    expect(dialog).toMatch(/setUiVersion\('classic', reason\.trim\(\) \|\| undefined\)/);
  });
});
