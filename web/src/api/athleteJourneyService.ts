import api from './api';

// Workstream E1 (LeadPack Master Build Handoff): GET /api/analytics/athlete/:athleteId/journey.

export type Band = 'top' | 'middle' | 'bottom' | null;

export interface SeasonBest {
  paceSecPerMile: number;
  timeSec: number;
  raceId: string;
  raceName: string;
  date: string;
  distanceMeters: number;
}

export interface JourneySeason {
  year: number;
  rank: number | null;
  rosterSize: number;
  band: Band;
  seasonBest: SeasonBest | null;
  isCaptain: boolean;
}

export interface CourseBest {
  courseId: string;
  courseName: string | null;
  raceCount: number;
  bestTimeSec: number;
  bestRaceId: string;
  bestRaceName: string;
  bestDate: string;
  worstTimeSec: number;
  deltaSec: number;
}

export interface PersonalRecord {
  distanceMeters: number;
  time: number;
  raceId: string;
  raceName: string;
  date: string;
}

export interface AthleteJourney {
  athlete: { id: string; name: string; gender: string | null; graduationYear: number | null };
  seasons: JourneySeason[];
  courseBests: CourseBest[];
  prs: PersonalRecord[];
}

export const athleteJourneyService = {
  async getJourney(athleteId: string): Promise<AthleteJourney> {
    const response = await api.get<AthleteJourney>(`/analytics/athlete/${athleteId}/journey`);
    return response.data;
  },
};
