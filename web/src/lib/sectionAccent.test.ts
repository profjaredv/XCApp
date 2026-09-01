import { describe, it, expect } from 'vitest';
import { accentFor, sectionForNavKey, SECTION_KEYS, type SectionKey } from './sectionAccent';

// The accent system only works if a colour means the same thing everywhere.
// These pin the two rules that make that true: assignment is fixed, and no
// class name is ever built by string interpolation.

describe('sectionAccent', () => {
  it('gives every section a complete set of classes', () => {
    for (const key of SECTION_KEYS) {
      const a = accentFor(key);
      for (const slot of ['bg', 'soft', 'text', 'border', 'on', 'rail'] as const) {
        expect(a[slot], `${key}.${slot}`).toBeTruthy();
      }
    }
  });

  it('assigns colours by section, never by position', () => {
    // The failure this prevents: a palette indexed by order, so adding a
    // seventh nav item repaints Athletes. Athletes is blue permanently.
    expect(accentFor('athletes').bg).toBe('bg-accent-athletes');
    expect(accentFor('meets').bg).toBe('bg-accent-meets');
    expect(accentFor('season').bg).toBe('bg-accent-season');
  });

  it('gives each real section a distinct colour', () => {
    const real = SECTION_KEYS.filter((k) => k !== 'neutral');
    const fills = real.map((k) => accentFor(k).bg);
    expect(new Set(fills).size).toBe(real.length);
  });

  it('uses complete class names Tailwind can find in source', () => {
    // `bg-accent-${key}` compiles to nothing — Tailwind scans text, it does
    // not evaluate expressions. Every value must be a literal.
    for (const key of SECTION_KEYS) {
      const a = accentFor(key);
      for (const value of Object.values(a)) {
        expect(value).not.toContain('${');
        expect(value).toMatch(/^[a-z-]+$/);
      }
    }
  });

  it('never assumes white is readable on a fill', () => {
    // The light teal measures 4.22:1 against white and 4.91:1 against ink,
    // so it takes ink. If this ever reverts to text-white the header icon
    // gets harder to see.
    expect(accentFor('training').on).toBe('text-accent-training-on');
  });

  it('falls back to neutral for an unknown section', () => {
    expect(accentFor('nope' as SectionKey).bg).toBe('bg-primary');
    expect(sectionForNavKey('does-not-exist')).toBe('neutral');
  });

  it('maps the nav spine to its sections', () => {
    expect(sectionForNavKey('athletes')).toBe('athletes');
    expect(sectionForNavKey('groups')).toBe('groups');
    expect(sectionForNavKey('schedule')).toBe('meets');
    expect(sectionForNavKey('program')).toBe('program');
    // Settings configures everything, so it belongs to nothing.
    expect(sectionForNavKey('settings')).toBe('neutral');
  });
});
