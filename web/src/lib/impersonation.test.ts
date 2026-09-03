import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Exiting athlete preview used to reload whatever URL the tab was
// currently on. Preview always ENTERS on /me — the athlete's own view —
// so exiting from there reloaded /me too, now under the coach's own
// account, which has no linked athlete. That showed a coach "Your
// profile isn't linked yet" on every single exit.
//
// No jsdom here (this project's vitest config runs pure node), so these
// check the source directly — same convention as the rest of this
// codebase's non-component logic tests.

const source = fs.readFileSync(path.join(__dirname, 'impersonation.ts'), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

describe('clearPreviewAthlete', () => {
  it('no longer reloads the current URL by default', () => {
    // That reload-in-place is exactly the bug: it re-renders whatever
    // route the tab happened to be on, under the now-cleared identity.
    const fn = code.slice(code.indexOf('export function clearPreviewAthlete'));
    expect(fn).not.toMatch(/window\.location\.reload\(\)/);
  });

  it('navigates to an explicit destination when one is given', () => {
    const fn = code.slice(code.indexOf('export function clearPreviewAthlete'));
    expect(fn).toMatch(/if \(destination\) window\.location\.href = destination;/);
  });

  it('internal callers clear the flag without triggering its own navigation', () => {
    // setAdminTeam and clearAdminTeam are already mid-navigation
    // themselves (their own href assignment / reload follows) — passing
    // a destination here would race their own redirect.
    const setAdminTeam = code.slice(
      code.indexOf('export function setAdminTeam'),
      code.indexOf('export function clearAdminTeam')
    );
    expect(setAdminTeam).toMatch(/clearPreviewAthlete\(\);/);

    const clearAdminTeam = code.slice(
      code.indexOf('export function clearAdminTeam'),
      code.indexOf('export function getPreviewAthleteId')
    );
    expect(clearAdminTeam).toMatch(/clearPreviewAthlete\(\);/);
  });
});
