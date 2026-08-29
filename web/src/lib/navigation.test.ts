import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, navFor, navEntry, type NavAudience } from './navigation';
import { WALKTHROUGH_STEPS } from './walkthroughContent';

// The feature tour and the sidebar drifted apart badly enough that the tour
// sent coaches to an "Analytics" screen the sidebar calls "Season", and sent
// athletes to four screens that are not in an athlete's sidebar at all.
// They now share lib/navigation.ts. These are the checks on the seam that
// remains.

describe('the nav data itself', () => {
  it('has unique keys', () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every entry an audience and a team-relative path', () => {
    for (const item of NAV_ITEMS) {
      expect(item.audience.length, `${item.key} reaches nobody`).toBeGreaterThan(0);
      expect(item.path.startsWith('/'), `${item.key} path must be team-relative`).toBe(true);
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('puts nothing in Setup that an athlete is meant to see', () => {
    // Setup is the coach-only configuration section, and volunteers do not
    // get it either.
    for (const item of NAV_ITEMS.filter((i) => i.section === 'setup')) {
      expect(item.audience, `${item.key}`).not.toContain('athlete');
    }
  });

  it('throws on an unknown key rather than rendering a blank item', () => {
    expect(() => navEntry('does-not-exist')).toThrow(/Unknown nav item/);
  });
});

describe('the tour matches the sidebar', () => {
  const roles: NavAudience[] = ['coach', 'athlete'];

  it.each(roles)('%s: every step is a real nav entry for that role', (role) => {
    for (const step of WALKTHROUGH_STEPS[role]) {
      const entry = NAV_ITEMS.find((i) => i.key === step.navKey);
      expect(entry, `${role} step "${step.navKey}" is not a nav item`).toBeDefined();
      expect(
        entry!.audience,
        `${role} is toured through "${entry!.label}", which is not in their sidebar`
      ).toContain(role);
    }
  });

  it.each(roles)('%s: every step calls the screen what the sidebar calls it', (role) => {
    // The specific failure last time: the sidebar said "Athletes", the tour
    // said "Roster". Titles are derived now, so this is a check that they
    // still are.
    for (const step of WALKTHROUGH_STEPS[role]) {
      const entry = navEntry(step.navKey);
      expect(step.title).toBe(entry.label);
      expect(step.path).toBe(entry.path);
      expect(step.icon).toBe(entry.icon);
    }
  });

  it.each(roles)('%s: steps follow sidebar order', (role) => {
    // A tour that jumps around the sidebar is harder to follow than one
    // that walks it, and the spine is already ordered as a hierarchy.
    const order = NAV_ITEMS.map((i) => i.key);
    const positions = WALKTHROUGH_STEPS[role].map((s) => order.indexOf(s.navKey));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('tours an athlete through their whole sidebar', () => {
    // Four items; there is no reason to leave one out.
    const nav = navFor('athlete', 'spine').map((i) => i.key);
    expect(WALKTHROUGH_STEPS.athlete.map((s) => s.navKey)).toEqual(nav);
  });

  it('tours a coach through the whole spine, plus Settings', () => {
    const spine = navFor('coach', 'spine').map((i) => i.key);
    const toured = WALKTHROUGH_STEPS.coach.map((s) => s.navKey);
    for (const key of spine) {
      expect(toured, `the coach tour skips "${navEntry(key).label}"`).toContain(key);
    }
    // Setup holds four screens; Settings is the one worth a first-run stop
    // (pace zones, staff, export). The rest are found when needed.
    expect(toured).toContain('settings');
  });

  it.each(roles)('%s: every step says something specific', (role) => {
    for (const step of WALKTHROUGH_STEPS[role]) {
      expect(step.description.length, `${step.navKey}`).toBeGreaterThan(40);
      expect(step.cta.trim().length).toBeGreaterThan(0);
      // A description that just restates the title teaches nothing.
      expect(step.description.toLowerCase()).not.toBe(step.title.toLowerCase());
    }
  });

  it('has no duplicate steps within a role', () => {
    for (const role of roles) {
      const keys = WALKTHROUGH_STEPS[role].map((s) => s.navKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
