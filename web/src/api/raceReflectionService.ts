import api from './api';

export interface RaceReflection {
  processGoal: string | null;
  outcomeGoal: string | null;
  targetTimeSec: number | null;
  targetSplits: Array<{ markerMeters: number; elapsedSec: number }> | null;
  keyFocus: string | null;
  preSubmittedAt: string | null;
  feelingRating: number | null;
  effortRating: number | null;
  whatWorked: string | null;
  whatDidnt: string | null;
  postNotes: string | null;
  postSubmittedAt: string | null;
  sharedWithCoach: boolean;
}

export interface MyReflection {
  reflection: RaceReflection;
  locked: boolean;
  lockAt: string | null;
}

export interface CoachVisibleReflection {
  athleteId: string;
  athleteName: string;
  processGoal: string | null;
  outcomeGoal: string | null;
  targetTimeSec: number | null;
  targetSplits: Array<{ markerMeters: number; elapsedSec: number }> | null;
  keyFocus: string | null;
  feelingRating: number | null;
  effortRating: number | null;
  whatWorked: string | null;
  whatDidnt: string | null;
  postNotes: string | null;
}

export const raceReflectionService = {
  async getMine(raceId: string): Promise<MyReflection> {
    const response = await api.get<MyReflection>(`/race-reflections/mine/${raceId}`);
    return response.data;
  },

  async savePreRace(
    raceId: string,
    input: { processGoal?: string; outcomeGoal?: string; targetTimeSec?: number; targetSplits?: unknown; keyFocus?: string }
  ) {
    const response = await api.put(`/race-reflections/mine/${raceId}/pre-race`, input);
    return response.data as RaceReflection;
  },

  async savePostRace(
    raceId: string,
    input: { feelingRating?: number; effortRating?: number; whatWorked?: string; whatDidnt?: string; postNotes?: string }
  ) {
    const response = await api.put(`/race-reflections/mine/${raceId}/post-race`, input);
    return response.data as RaceReflection;
  },

  async setSharing(raceId: string, sharedWithCoach: boolean) {
    const response = await api.put(`/race-reflections/mine/${raceId}/sharing`, { sharedWithCoach });
    return response.data as RaceReflection;
  },

  async getForRace(raceId: string): Promise<CoachVisibleReflection[]> {
    const response = await api.get<CoachVisibleReflection[]>(`/race-reflections/race/${raceId}`);
    return response.data;
  },
};
