import { describe, it, expect } from 'vitest';
import { paceChartData, toPaceDatum } from './paceChart';
import type { AthleteBuildStats, AthleteCareerRaceResult, AthleteRaceResult } from '../state/types';

function seasonRace(overrides: Partial<AthleteRaceResult> = {}): AthleteRaceResult {
  return { raceName: 'Season Opener', date: '2026-09-05', distanceMeters: 5000, distanceLabel: '5K', timeSec: 1052, ...overrides };
}

function careerRace(overrides: Partial<AthleteCareerRaceResult> = {}): AthleteCareerRaceResult {
  return { ...seasonRace(), season: 2026, ...overrides };
}

function stats(overrides: Partial<AthleteBuildStats> = {}): AthleteBuildStats {
  return {
    name: 'Alex',
    season: 2026,
    grade: 11,
    careerBest5kSec: 1030,
    totalMiles: 100,
    averagePaceSecPerMile: 420,
    totalRaces: 1,
    bestByDistance: [],
    races: [seasonRace()],
    careerRaces: [careerRace()],
    ...overrides,
  };
}

describe('toPaceDatum', () => {
  it('converts time + distance into seconds-per-mile', () => {
    const d = toPaceDatum(seasonRace({ timeSec: 1609.34, distanceMeters: 1609.34 }));
    expect(d?.pace).toBeCloseTo(1609.34, 1); // one mile in exactly timeSec seconds -> that many sec/mile
  });

  it('returns null for a race with no usable distance, rather than dividing by zero', () => {
    expect(toPaceDatum(seasonRace({ distanceMeters: null }))).toBeNull();
    expect(toPaceDatum(seasonRace({ distanceMeters: 0 }))).toBeNull();
  });
});

describe('paceChartData', () => {
  it('returns nothing for a null stats object', () => {
    expect(paceChartData(null)).toEqual({ data: [], isCareer: false });
  });

  it('uses the season view for a freshman (grade 9), even with multi-season career data', () => {
    const result = paceChartData(
      stats({
        grade: 9,
        careerRaces: [careerRace({ season: 2025 }), careerRace({ season: 2026 })],
      }),
    );
    expect(result.isCareer).toBe(false);
  });

  it('uses the season view when career data spans only one season (nothing earlier to show)', () => {
    const result = paceChartData(stats({ grade: 11, careerRaces: [careerRace({ season: 2026 })] }));
    expect(result.isCareer).toBe(false);
  });

  it('uses the career view for a non-freshman with races spanning more than one season', () => {
    const result = paceChartData(
      stats({
        grade: 11,
        careerRaces: [careerRace({ season: 2025, raceName: 'Sophomore Opener' }), careerRace({ season: 2026 })],
      }),
    );
    expect(result.isCareer).toBe(true);
    expect(result.data.some((d) => d.raceName === 'Sophomore Opener')).toBe(true);
  });

  it('sorts points by date and drops races with no usable distance', () => {
    const result = paceChartData(
      stats({
        grade: 11,
        careerRaces: [
          careerRace({ season: 2025, date: '2025-09-10', raceName: 'Later' }),
          careerRace({ season: 2025, date: '2025-09-01', raceName: 'Earlier' }),
          careerRace({ season: 2026, date: '2026-09-01', raceName: 'No distance', distanceMeters: null }),
        ],
      }),
    );
    expect(result.data.map((d) => d.raceName)).toEqual(['Earlier', 'Later']);
  });
});
