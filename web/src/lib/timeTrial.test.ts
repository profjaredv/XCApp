import { describe, expect, it } from 'vitest';
import type { GridColumn } from './meetTrend';
import { buildTimeTrialFitness, isTimeTrial } from './timeTrial';

const MILE = 1609.344;
describe('isTimeTrial: 1 mile or 1600m AND "time trial" in the name', () => {
  it('accepts both distances and common spellings', () => {
    expect(isTimeTrial('Reed Park Time Trial', MILE)).toBe(true);
    expect(isTimeTrial('Mile time-trial', 1600)).toBe(true);
    expect(isTimeTrial('Team TT', 1609)).toBe(true);
  });
  it('rejects a mile race that is not named one, and a time trial at another distance', () => {
    expect(isTimeTrial('Ellensburg Invitational', MILE)).toBe(false);
    expect(isTimeTrial('Reed Park Time Trial', 1500)).toBe(false);
    expect(isTimeTrial('Reed Park Time Trial', 3218.7)).toBe(false);
    expect(isTimeTrial('Reed Park Time Trial', null)).toBe(false);
    expect(isTimeTrial('Attitude check', MILE)).toBe(false); // "tt" inside a word is not "TT"
  });
});

const col = (name: string, meters: number, date: string): GridColumn => ({ name, meetKey: `${name}|${date}`, distanceMeters: meters, date });
const columns: GridColumn[] = [
  col('Reed Park Time Trial', MILE, '2026-09-08'),
  col('Relays', 2414, '2026-09-11'), // 1.5 miles: not a distance race
  col('Bellevue', 5000, '2026-09-19'),
  col('Sunfair', 3 * MILE, '2026-10-03'),
  col('Team Time Trial', 1600, '2026-10-08'), // retest
  col('Nike', 5000, '2026-10-10'),
];
// 6:40 mile = 400s. 5K at 7:30/mi = 1450s; 3 mile at 7:00/mi = 1260s; 5K at 6:40/mi.
const sec = (pacePerMile: number, meters: number) => (pacePerMile * meters) / MILE;
const athletes = [
  { athleteId: 'a', name: 'Ada', gender: 'M', results: [400, 1000, sec(450, 5000), sec(420, 3 * MILE), (385 * 1600) / MILE, sec(400, 5000)] },
  { athleteId: 'b', name: 'Bo', gender: 'F', results: [null, null, sec(500, 5000), null, null, null] }, // no time trial: left out
  { athleteId: 'c', name: 'Cy', gender: 'M', results: [420, null, sec(480, 5000), null, null, null] }, // one distance race
];

describe('buildTimeTrialFitness', () => {
  const { rows, summary, hasTimeTrial } = buildTimeTrialFitness(columns, athletes);
  const ada = rows.find((r) => r.athleteId === 'a')!;

  it('uses only athletes with a time trial and a later distance race', () => {
    expect(hasTimeTrial).toBe(true);
    expect(rows.map((r) => r.athleteId)).toEqual(['a', 'c']);
  });

  it('compares the mile to the average pace of 2 mile and up, ignoring a 1.5 mile race', () => {
    expect(ada.tt.pace).toBeCloseTo(400, 3);
    expect(ada.races.map((r) => r.name)).toEqual(['Bellevue', 'Sunfair', 'Nike']);
    expect(ada.avgRacePace).toBeCloseTo((450 + 420 + 400) / 3, 3);
    expect(ada.gap).toBeCloseTo(23.33, 1);
  });

  it('reports how far the gap closed from the first to the latest race, and a match', () => {
    expect(ada.races[0].vsMile).toBeCloseTo(50, 3);
    expect(ada.narrowed).toBeCloseTo(50, 3); // 50s slower than the mile at first, level at the end
    expect(ada.matched).toBe(true); // latest 5K pace (6:40) equals the mile pace
    expect(rows.find((r) => r.athleteId === 'c')).toMatchObject({ narrowed: null, matched: false });
  });

  it('notes a faster retest and summarises the team', () => {
    expect(ada.retest?.pace).toBeCloseTo(385, 3);
    expect(summary).toMatchObject({ athletes: 2, matched: 1, retests: 1, fasterRetests: 1 });
    expect(summary.medianNarrowed).toBeCloseTo(50, 3);
  });

  it('respects a group scope, and reports when the team has no time trial', () => {
    expect(buildTimeTrialFitness(columns, athletes, new Set(['c'])).rows.map((r) => r.athleteId)).toEqual(['c']);
    const none = buildTimeTrialFitness(columns.filter((c) => !/time trial/i.test(c.name)), athletes);
    expect(none.hasTimeTrial).toBe(false);
    expect(none.rows).toEqual([]);
  });
});
