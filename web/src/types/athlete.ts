import { RacePerformance } from './performance';

export interface Athlete {
  id: string;
  name: string;
  gender: 'M' | 'F' | 'O';
  graduationYear?: number;
  isActive: boolean;
  team?: string;
  seasons?: number[];
  metrics?: AthleteMetrics;
  grade?: number;
  bestRace?: RacePerformance;
  totalRaces?: number;
}

export interface AthleteSeasonData {
  athlete: Athlete;
  season: number;
  metrics: AthleteMetrics;
}

export interface AthleteMetrics {
  totalRaces: number;
  totalMiles: number;
  avgPace: number;
  // best5kTime is zero for a team that doesn't race 5Ks (see F2, XCApp
  // pre-season fixes doc). bestPaceSecPerMile is the real, distance-
  // agnostic replacement — kept alongside rather than in place of it.
  best5kTime?: number;
  bestPaceSecPerMile?: number;
  improvement?: number;
  races: RacePerformance[];
}
