import { describe, expect, it } from 'vitest';
import { buildMeetTrend, type GridColumn, type GridAthlete } from './meetTrend';

const MILE = 1609.344;
// Columns arrive in date order from the server, but the trend sorts anyway.
const columns: GridColumn[] = [
  { name: 'Apple Ridge', meetKey: 'meet:m2', distanceMeters: 5000, date: '2026-09-20' },
  { name: 'Early Season', meetKey: 'race:r1', distanceMeters: 2 * MILE, date: '2026-09-05' },
  { name: 'Apple Ridge', meetKey: 'meet:m2', distanceMeters: 3200, date: '2026-09-20' },
  { name: 'Undated', meetKey: 'race:x', distanceMeters: 5000, date: null },
];
const fiveKMiles = 5000 / MILE;
const athletes: GridAthlete[] = [
  // 2-mile at 330/mi, then 5K at 320/mi.
  { athleteId: 'b1', gender: 'M', results: [320 * fiveKMiles, 660, null, 999] },
  // 2-mile at 350/mi, then 5K at 360/mi (slower).
  { athleteId: 'b2', gender: 'M', results: [360 * fiveKMiles, 700, null, null] },
  // Girl ran only the 3200 at Apple Ridge.
  { athleteId: 'g1', gender: 'F', results: [null, 800, 800, null] },
];

describe('buildMeetTrend', () => {
  const t = buildMeetTrend(columns, athletes);
  it('orders meets by date and folds a meet’s distances together, skipping undated columns', () => {
    expect(t.map((p) => [p.name, p.meetId, p.runners])).toEqual([
      ['Early Season', null, 3],
      ['Apple Ridge', 'm2', 3],
    ]);
  });
  it('averages pace for team, boys and girls', () => {
    expect(t[0].boys).toBeCloseTo(340);
    expect(t[0].girls).toBeCloseTo(400);
    expect(t[1].boys).toBeCloseTo(340);
  });
  it('compares each athlete with their own previous race', () => {
    expect(t[0]).toMatchObject({ compared: 0, faster: 0, medianChange: null, delta: null });
    expect(t[1].compared).toBe(3);
    expect(t[1].faster).toBe(1);
  });
  it('counts season bests only against an earlier time at the same distance', () => {
    expect(t[1].seasonBests).toBe(0);
    const again = buildMeetTrend(
      [
        { name: 'A', meetKey: 'race:a', distanceMeters: 5000, date: '2026-09-01' },
        { name: 'B', meetKey: 'race:b', distanceMeters: 5000, date: '2026-09-08' },
      ],
      [{ athleteId: 'x', gender: 'M', results: [1100, 1080] }]
    );
    expect(again[1].seasonBests).toBe(1);
    expect(again[1].delta).toBeLessThan(0);
  });
  it('limits to the group scope when one is set', () => {
    const g = buildMeetTrend(columns, athletes, new Set(['g1']));
    expect(g.map((p) => [p.runners, p.boys])).toEqual([
      [1, null],
      [1, null],
    ]);
  });
});
