import api from './api';

export interface RosterAthlete {
  id: string;
  name: string;
  gender?: string | null;
  /** Derived for the requested season, not stored on the athlete. */
  grade: number | null;
  graduationYear: number | null;
  raceCount: number;
  graduated: boolean;
  onRoster: boolean;
}

export interface StartSeasonResult {
  success: boolean;
  season: number;
  fromSeason: number | null;
  carriedCount: number;
  graduatedCount: number;
  carried: Array<{ id: string; name: string; grade: number | null }>;
  graduated: Array<{ id: string; name: string; graduationYear: number }>;
  /** Athletes with no graduation year — we can't tell if they aged out. */
  needsReview: Array<{ id: string; name: string }>;
  message: string;
}

export const rosterService = {
  async getRoster(season?: number, opts?: { activeOnly?: boolean }): Promise<RosterAthlete[]> {
    const response = await api.get<RosterAthlete[]>('/athletes', {
      params: {
        ...(season ? { season } : {}),
        activeOnly: opts?.activeOnly ?? true,
      },
    });
    return response.data;
  },

  async addAthlete(input: {
    name: string;
    grade?: number;
    graduationYear?: number;
    gender?: string;
    season?: number;
  }): Promise<RosterAthlete> {
    const response = await api.post<RosterAthlete>('/athletes', input);
    return response.data;
  },

  async updateAthlete(
    athleteId: string,
    input: { name?: string; grade?: number; graduationYear?: number; gender?: string; season?: number }
  ): Promise<RosterAthlete> {
    const response = await api.put<RosterAthlete>(`/athletes/${athleteId}`, input);
    return response.data;
  },

  /** Roll the roster into a new season: returning athletes move up, seniors age out. */
  async startSeason(year: number, opts?: { fromSeason?: number }): Promise<StartSeasonResult> {
    const response = await api.post<StartSeasonResult>(`/teams/seasons/${year}/start`, {
      ...(opts?.fromSeason ? { fromSeason: opts.fromSeason } : {}),
    });
    return response.data;
  },

  async addToRoster(season: number, athleteId: string, grade?: number) {
    const response = await api.post(`/teams/seasons/${season}/roster`, { athleteId, grade });
    return response.data;
  },

  /** Deactivates the roster entry; the athlete's results are never deleted. */
  async removeFromRoster(season: number, athleteId: string) {
    const response = await api.delete(`/teams/seasons/${season}/roster/${athleteId}`);
    return response.data;
  },
};
