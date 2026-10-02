import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NAV_ITEMS } from './navigation';

// Per-team features: the web half.
//
// The catalog lives on the backend (lib/teamFeatures.js) so the list that
// renders the switches and the middleware that enforces them can't drift.
// What can still go wrong here is a surface that stays visible after its
// feature is off — a nav entry, a button, a route — which is exactly what
// makes a coach think the setting did nothing.

const SRC = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

describe('optional-feature surfaces', () => {
  it('marks the nav entries that belong to an optional feature', () => {
    const byKey = Object.fromEntries(NAV_ITEMS.map((i) => [i.key, i]));
    expect(byKey.equipment.feature).toBe('equipment');
    expect(byKey['field-results'].feature).toBe('fieldResults');
  });

  it('leaves the spine unswitchable — roster, schedule and season are what the app is', () => {
    for (const item of NAV_ITEMS.filter((i) => i.section === 'spine')) {
      expect(item.feature, `${item.key} must not be optional`).toBeUndefined();
    }
  });

  it('filters the sidebar on those flags', () => {
    const layout = code(read('components/Layout.tsx'));
    expect(layout).toContain('useTeamFeatures');
    expect(layout).toMatch(/item\.feature/);
  });

  it('guards the pages themselves, not just the nav', () => {
    const router = code(read('router/index.tsx'));
    for (const feature of ['attendance', 'equipment', 'fieldResults', 'photos']) {
      expect(router, `${feature} route is unguarded`).toContain(`<FeatureGate feature="${feature}"`);
    }
  });

  it('hides the Attendance button on Schedule', () => {
    const schedule = code(read('pages/SchedulePage.tsx'));
    expect(schedule).toContain("useFeatureEnabled('attendance')");
    expect(schedule).toContain('attendanceEnabled &&');
  });

  it('hides the Photos button on Meets, for both the coach and the family view', () => {
    // Photos needs both audiences, so unlike attendance/equipment it can't
    // be a 'setup' or 'spine' NAV_ITEMS entry (spine must stay unswitchable;
    // setup is coach-only) — it's an inline button on Meets instead, same
    // shape as Attendance's button on Schedule.
    const meetsPage = code(read('pages/MeetsPage.tsx'));
    expect(meetsPage).toContain("useFeatureEnabled('photos')");
    const occurrences = meetsPage.match(/photosEnabled &&/g) ?? [];
    expect(occurrences.length, 'expected one gated button per view (coach and family)').toBe(2);
  });

  it('hides reflections from both the athlete and the coach when they are off', () => {
    expect(code(read('pages/MyProgressPage.tsx'))).toContain("useFeatureEnabled('reflections')");
    expect(code(read('pages/MeetDetailPage.tsx'))).toContain("useFeatureEnabled('reflections')");
  });

  it('treats an unknown or still-loading state as on', () => {
    // A team that never turned anything off must never lose a screen
    // because one request was slow or failed.
    const hook = code(read('hooks/useTeamFeatures.ts'));
    expect(hook).toContain("typeof value === 'boolean' ? value : true");
    expect(code(read('components/FeatureGate.tsx'))).toContain('enabled !== false');
  });
});
