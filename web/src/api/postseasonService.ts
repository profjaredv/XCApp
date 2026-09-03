import api from './api';

export type PostseasonLevel = 'LEAGUE' | 'DISTRICT' | 'REGIONAL' | 'STATE' | 'NATIONAL';

export const POSTSEASON_LEVELS: PostseasonLevel[] = ['LEAGUE', 'DISTRICT', 'REGIONAL', 'STATE', 'NATIONAL'];

export const POSTSEASON_LABELS: Record<PostseasonLevel, string> = {
  LEAGUE: 'League',
  DISTRICT: 'Districts',
  REGIONAL: 'Regionals',
  STATE: 'State',
  NATIONAL: 'Nationals',
};

/** Longer forms, for the tagging dropdown where a coach is choosing rather than reading. */
export const POSTSEASON_PICKER_LABELS: Record<PostseasonLevel, string> = {
  LEAGUE: 'League / conference',
  DISTRICT: 'District / sectional',
  REGIONAL: 'Regional',
  STATE: 'State',
  NATIONAL: 'National',
};

export interface PostseasonAthleteRace {
  raceId: string;
  raceName: string;
  date: string;
  level: PostseasonLevel;
  timeSec: number;
  paceSecPerMile: number | null;
  /** Null means no full field has been uploaded — never "unplaced". */
  place: number | null;
  overallPlace: number | null;
  overallFieldSize: number | null;
  division: string | null;
}

export interface PostseasonAthlete {
  athleteId: string;
  name: string;
  gender: 'M' | 'F' | null;
  grade: number | null;
  furthestLevel: PostseasonLevel | null;
  seasonBestPaceSecPerMile: number | null;
  bestPostseasonPaceSecPerMile: number | null;
  /** Seconds per mile their postseason best beat their season best by. Positive = peaked when it counted. */
  peakedSec: number | null;
  races: PostseasonAthleteRace[];
}

export interface PostseasonRace {
  id: string;
  meetId: string | null;
  name: string;
  date: string;
  level: PostseasonLevel;
  distance: string | null;
  distanceMeters: number | null;
  entrants: number;
  bestTimeSec: number | null;
  packSpreadSec: number | null;
  avgPaceSecPerMile: number | null;
}

export interface PostseasonMeetTag {
  id: string;
  name: string;
  date: string;
  raceCount: number;
  level: PostseasonLevel | null;
  /** The meet's races carry different levels — choosing one sets them all. */
  mixed: boolean;
  /** Read from the name. Offered, never applied. */
  suggestedLevel: PostseasonLevel | null;
}

export interface PostseasonSeason {
  season: number;
  counts: Record<PostseasonLevel, { total: number; men: number; women: number; raceCount: number }>;
  furthestLevel: PostseasonLevel | null;
  taggedRaceCount: number;
  totalRaceCount: number;
  races: PostseasonRace[];
  athletes: PostseasonAthlete[];
  meets: PostseasonMeetTag[];
}

export const postseasonService = {
  async get(season?: number): Promise<PostseasonSeason> {
    const response = await api.get<PostseasonSeason>('/analytics/postseason', {
      params: season ? { season } : {},
    });
    return response.data;
  },

  /** Tag several meets at once; the server recalculates every season touched. */
  async saveTags(tags: Array<{ meetId: string; level: PostseasonLevel | null }>) {
    const response = await api.patch<{ meetsUpdated: number; racesUpdated: number; seasonsRecalculated: number[] }>(
      '/analytics/postseason/tags',
      { tags }
    );
    return response.data;
  },
};
