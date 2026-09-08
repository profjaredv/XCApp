import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// No jsdom in this project's vitest config (see vitest.config.ts), so this
// scans the source the same way every other page/component test here does
// rather than mounting anything — see raceLiveTimer.test.ts for the same
// convention.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const src = read('registerServiceWorker.ts');

describe('registerServiceWorker', () => {
  it('checks for an update whenever the app is foregrounded, not only at page load', () => {
    // Workbox's own check only fires on registration (effectively page
    // load) — a home-screen PWA on iOS is resumed, not reloaded, across
    // launches, so that one check is not enough. See onRegisteredSW's
    // comment for the full reasoning.
    expect(src).toContain("document.addEventListener('visibilitychange'");
    expect(src).toContain("document.visibilityState === 'visible'");
    expect(src).toContain('registration.update()');
  });

  it('also checks on an iOS back-forward-cache restore, not just visibilitychange', () => {
    expect(src).toContain("window.addEventListener('pageshow'");
    expect(src).toContain('e.persisted');
  });

  it('falls back to a periodic check for a long foregrounded session', () => {
    expect(src).toContain('setInterval(checkForUpdate');
  });

  it('still never reloads on its own — the coach applies the update via the toast action', () => {
    expect(src).toContain('duration: Infinity');
    expect(src).toContain('updateSW(true)');
    expect(src).not.toContain('onNeedRefresh() {\n      updateSW(true)');
  });
});
