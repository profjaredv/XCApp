import { describe, it, expect } from 'vitest';
import { anchorFor, elapsedSince } from './stopwatch';

describe('anchorFor', () => {
  it('starts a fresh clock at the current instant', () => {
    expect(anchorFor(0, 1_000_000)).toBe(1_000_000);
  });

  it('carries existing elapsed so Resume continues instead of restarting', () => {
    // 90s already on the clock: the anchor sits 90s in the past.
    expect(anchorFor(90_000, 1_000_000)).toBe(910_000);
  });

  it('ignores a negative elapsed rather than pushing the anchor into the future', () => {
    expect(anchorFor(-5_000, 1_000_000)).toBe(1_000_000);
  });
});

describe('elapsedSince', () => {
  it('counts plain wall-clock time', () => {
    expect(elapsedSince(1_000_000, 0, 1_012_500)).toBe(12_500);
  });

  it('COUNTS TIME THE DEVICE SPENT ASLEEP — the whole point of the change', () => {
    // A coach pockets the phone for three minutes mid-rep. performance.now()
    // on Android does not advance through deep sleep, so the old anchoring
    // silently dropped this entire span; the Garmin on their wrist did not.
    const anchor = anchorFor(0, 1_000_000);
    const afterSleep = elapsedSince(anchor, 5_000, 1_000_000 + 195_000);
    expect(afterSleep).toBe(195_000);
  });

  it('never rewinds when the system clock steps backwards', () => {
    // An NTP correction mid-rep would otherwise make the display count
    // down, which reads as the app losing its mind.
    expect(elapsedSince(1_000_000, 60_000, 1_000_000 + 55_000)).toBe(60_000);
  });

  it('never goes negative', () => {
    expect(elapsedSince(1_000_000, 0, 999_000)).toBe(0);
  });

  it('is monotonic across a run of ticks, sleep included', () => {
    const anchor = anchorFor(0, 0);
    let prev = 0;
    for (const now of [100, 250, 400, 400, 180_000, 180_100]) {
      const next = elapsedSince(anchor, prev, now);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
    expect(prev).toBe(180_100);
  });
});
