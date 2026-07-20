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
  best5kTime?: number;
  improvement?: number;
  races: RacePerformance[];
}
