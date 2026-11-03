import { formatRaceDate } from './raceFormat';
import type { AthleteBuildStats, AthleteCareerRaceResult, AthleteRaceResult } from '../state/types';

export interface PaceDatum {
  date: string;
  label: string;
  pace: number;
  raceName: string;
}

/** Pure — no usable pace without a real distance, same "degrade, don't break" choice as the printed collage's own stat blocks. */
export function toPaceDatum(race: AthleteRaceResult | AthleteCareerRaceResult): PaceDatum | null {
  if (!race.distanceMeters || race.distanceMeters <= 0) return null;
  const miles = race.distanceMeters / 1609.34;
  return { date: race.date, label: formatRaceDate(race.date), pace: race.timeSec / miles, raceName: race.raceName };
}

export interface PaceChartData {
  data: PaceDatum[];
  isCareer: boolean;
}

/**
 * Decides which race history BuildPaceChart.tsx plots, and converts it to
 * chartable points. A freshman (grade 9), or an athlete whose only race
 * history IS the current season, gets the season-only view — there's no
 * earlier data to make a "career" view meaningfully different, and
 * labeling a single season "Career" would be misleading.
 */
export function paceChartData(stats: AthleteBuildStats | null): PaceChartData {
  if (!stats) return { data: [], isCareer: false };
  const seasonsRepresented = new Set(stats.careerRaces.map((r) => r.season));
  const isCareer = stats.grade !== 9 && seasonsRepresented.size > 1;
  const source = isCareer ? stats.careerRaces : stats.races;
  const data = source
    .map(toPaceDatum)
    .filter((d): d is PaceDatum => d !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { data, isCareer };
}
