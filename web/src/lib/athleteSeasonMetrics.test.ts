import { describe, expect, it } from 'vitest';
import { readCareerMetrics, readSeasonMetrics } from './athleteSeasonMetrics';

describe('readSeasonMetrics', () => {
  it('reads the flat fields the server actually sends', () => {
    expect(readSeasonMetrics({ totalRaces: 5, totalMiles: 14.2, averagePace: 400, best5kTime: 1100 })).toEqual({
      totalRaces: 5, totalMiles: 14.2, avgPace: 400, best5kTime: 1100,
    });
  });
  it('falls back to bestTime5k when best5kTime is missing or zero', () => {
    expect(readSeasonMetrics({ best5kTime: 0, bestTime5k: 1234 }).best5kTime).toBe(1234);
  });
  it('still understands the legacy nested and snake_case shapes', () => {
    expect(readSeasonMetrics({ metrics: { totalRaces: 3, totalMiles: 9, avgMilePace: { overall: 420 }, best5kTime: 1300 } })).toEqual({
      totalRaces: 3, totalMiles: 9, avgPace: 420, best5kTime: 1300,
    });
    expect(readSeasonMetrics({ total_races: 2, total_miles: 6, average_pace: 450, best_time_5k: 1400 }).totalRaces).toBe(2);
  });
  it('is all zeros for nothing', () => {
    expect(readSeasonMetrics(undefined)).toEqual({ totalRaces: 0, totalMiles: 0, avgPace: 0, best5kTime: 0 });
    expect(readSeasonMetrics({})).toEqual({ totalRaces: 0, totalMiles: 0, avgPace: 0, best5kTime: 0 });
  });
});

describe('readCareerMetrics', () => {
  it('sums races and miles, weights pace by mileage, takes the best 5K', () => {
    const c = readCareerMetrics([
      { totalRaces: 4, totalMiles: 10, averagePace: 400, best5kTime: 1200 },
      { totalRaces: 6, totalMiles: 30, averagePace: 440, best5kTime: 1150 },
    ]);
    expect(c).toEqual({ totalRaces: 10, totalMiles: 40, avgPace: 430, best5kTime: 1150 });
  });
  it('a season without a 5K does not erase one from another season', () => {
    expect(readCareerMetrics([{ totalRaces: 1, best5kTime: 0 }, { totalRaces: 2, best5kTime: 1300 }]).best5kTime).toBe(1300);
  });
  it('is zero when there are no seasons', () => {
    expect(readCareerMetrics([]).totalRaces).toBe(0);
    expect(readCareerMetrics(null).best5kTime).toBe(0);
  });
});
