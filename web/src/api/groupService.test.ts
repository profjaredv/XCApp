import { describe, it, expect } from 'vitest';
import {
  fastestFirstPaceSecPerMile,
  fastestMileTime,
  average5kPaceSecPerMile,
  entrantPaceStat,
  type RosterAthleteWithRaces,
} from './groupService';

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

// Entrants list — "mile PR or average 5K pace, matched to the race
// distance" (see ManageEntrantsDialog.tsx). Distinct from
// fastestFirstPaceSecPerMile's "best pace at any distance, 5K-preferred"
// used for the Live Timer's sort — this is deliberately narrower, and
// deliberately averages rather than takes the fastest for the 5K case.

describe('fastestMileTime', () => {
  it('returns the fastest recorded time at (about) a mile, as a raw time not a pace', () => {
    const a = athlete([{ time: 320, distanceMeters: MILE }]);
    expect(fastestMileTime(a)).toBe(320);
  });

  it('takes the fastest of several mile times', () => {
    const a = athlete([
      { time: 340, distanceMeters: MILE },
      { time: 315, distanceMeters: MILE },
    ]);
    expect(fastestMileTime(a)).toBe(315);
  });

  it('ignores races at other distances entirely, even a fast 5K', () => {
    const a = athlete([{ time: 900, distanceMeters: FIVE_K }]);
    expect(fastestMileTime(a)).toBeNull();
  });
});

describe('average5kPaceSecPerMile', () => {
  it('averages pace across every 5K on record, not just the fastest', () => {
    const a = athlete([
      { time: 1000, distanceMeters: FIVE_K }, // 321.87 sec/mile
      { time: 1100, distanceMeters: FIVE_K }, // 354.06 sec/mile
    ]);
    const expected = (1000 / (FIVE_K / MILE) + 1100 / (FIVE_K / MILE)) / 2;
    expect(average5kPaceSecPerMile(a)).toBeCloseTo(expected, 2);
  });

  it('ignores non-5K races when averaging', () => {
    const a = athlete([
      { time: 1000, distanceMeters: FIVE_K },
      { time: 280, distanceMeters: MILE },
    ]);
    expect(average5kPaceSecPerMile(a)).toBeCloseTo(1000 / (FIVE_K / MILE), 2);
  });

  it('returns null with no 5K on record', () => {
    const a = athlete([{ time: 280, distanceMeters: MILE }]);
    expect(average5kPaceSecPerMile(a)).toBeNull();
  });
});

describe('entrantPaceStat', () => {
  it('shows mile PR for a race at mile distance', () => {
    const a = athlete([{ time: 300, distanceMeters: MILE }]);
    expect(entrantPaceStat(a, MILE)).toEqual({ label: 'Mile PR', seconds: 300 });
  });

  it('shows average 5K pace for a race at any other distance', () => {
    const a = athlete([{ time: 1000, distanceMeters: FIVE_K }]);
    const stat = entrantPaceStat(a, FIVE_K);
    expect(stat?.label).toBe('5K avg');
    expect(stat?.seconds).toBeCloseTo(1000 / (FIVE_K / MILE), 2);
  });

  it('falls back to 5K avg for a distance that is neither a mile nor a 5K, e.g. 2 miles', () => {
    const a = athlete([{ time: 1000, distanceMeters: FIVE_K }]);
    expect(entrantPaceStat(a, 3218.68)?.label).toBe('5K avg');
  });

  it('returns null when the race has no distance on record', () => {
    const a = athlete([{ time: 1000, distanceMeters: FIVE_K }]);
    expect(entrantPaceStat(a, null)).toBeNull();
  });

  it('returns null when the athlete has nothing in the matching bucket, even with other races on record', () => {
    const a = athlete([{ time: 1000, distanceMeters: FIVE_K }]);
    expect(entrantPaceStat(a, MILE)).toBeNull();
  });
});
