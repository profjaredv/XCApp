import { describe, it, expect } from 'vitest';
import { fastestFirstPaceSecPerMile, type RosterAthleteWithRaces } from './groupService';

// Live Timer's default "fastest first" sort on a big field (see
// RaceLiveTimerPage.tsx) — scanning sixty names for one is the whole
// reason a useful default order matters.

function athlete(races: Array<{ time: number; distanceMeters: number }>): RosterAthleteWithRaces {
  return {
    id: 'a1',
    name: 'Test Athlete',
    gender: null,
    grade: null,
    races: races.map((r) => ({ time: r.time, race: { date: '2026-09-01', distanceMeters: r.distanceMeters } })),
  };
}

const FIVE_K = 5000;
const MILE = 1609.34;

describe('fastestFirstPaceSecPerMile', () => {
  it('uses the fastest 5K when the athlete has one', () => {
    // 1000s over 5K = 321.87 sec/mile.
    const a = athlete([{ time: 1000, distanceMeters: FIVE_K }]);
    expect(fastestFirstPaceSecPerMile(a)).toBeCloseTo(1000 / (FIVE_K / MILE), 2);
  });

  it('takes the fastest of multiple 5Ks, not the most recent', () => {
    const a = athlete([
      { time: 1100, distanceMeters: FIVE_K },
      { time: 1000, distanceMeters: FIVE_K },
    ]);
    expect(fastestFirstPaceSecPerMile(a)).toBeCloseTo(1000 / (FIVE_K / MILE), 2);
  });

  it('prefers the 5K pace over a faster-looking shorter race', () => {
    // A mile time trial can produce a quicker per-mile pace than someone's
    // real primary-distance effort just from needing less endurance —
    // that must not outrank a genuine 5K benchmark.
    const a = athlete([
      { time: 1000, distanceMeters: FIVE_K }, // 321.87 sec/mile
      { time: 280, distanceMeters: MILE }, // 280 sec/mile — faster, but not a 5K
    ]);
    expect(fastestFirstPaceSecPerMile(a)).toBeCloseTo(1000 / (FIVE_K / MILE), 2);
  });

  it('falls back to best pace at any distance when there is no 5K on record', () => {
    const a = athlete([{ time: 280, distanceMeters: MILE }]);
    expect(fastestFirstPaceSecPerMile(a)).toBeCloseTo(280, 2);
  });

  it('returns null for an athlete with no races at all', () => {
    expect(fastestFirstPaceSecPerMile(athlete([]))).toBeNull();
  });

  it('ignores a zero or missing time rather than treating it as instant', () => {
    const a = athlete([{ time: 0, distanceMeters: FIVE_K }]);
    expect(fastestFirstPaceSecPerMile(a)).toBeNull();
  });
});
