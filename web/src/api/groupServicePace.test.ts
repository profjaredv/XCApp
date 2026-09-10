import { describe, it, expect } from 'vitest';
import { averagePaceSecPerMile } from './groupService';

const MILE = 1609.34;
const athlete = (races: Array<[number | null, number | null]>) => ({
  id: 'a',
  name: 'A',
  gender: 'M',
  grade: 10,
  races: races.map(([time, distanceMeters]) => ({ time, race: { date: '2025-09-01', distanceMeters } })),
});

describe('averagePaceSecPerMile', () => {
  it('averages pace across every distance, not just 5Ks', () => {
    // A 6:00 mile and a 7:00-pace 5K average to 6:30/mi.
    const out = averagePaceSecPerMile(athlete([[360, MILE], [420 * 5000 / MILE, 5000]]));
    expect(out).toBeCloseTo(390, 6);
  });

  it('still reports a pace for an athlete whose only races are mile time trials', () => {
    // average5kPaceSecPerMile returns null here — this is why the helper exists.
    expect(averagePaceSecPerMile(athlete([[360, MILE]]))).toBeCloseTo(360, 6);
  });

  it('is null, never 0, for an athlete who has not raced', () => {
    expect(averagePaceSecPerMile(athlete([]))).toBeNull();
  });

  it('ignores a missing or zero time instead of averaging it in as a fast race', () => {
    const out = averagePaceSecPerMile(athlete([[null, 5000], [0, 5000], [360, MILE]]));
    expect(out).toBeCloseTo(360, 6);
  });

  it('ignores a race with no distance on record, which has no pace to compute', () => {
    const out = averagePaceSecPerMile(athlete([[1200, null], [360, MILE]]));
    expect(out).toBeCloseTo(360, 6);
  });
});
