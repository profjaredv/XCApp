import { axiosInstance } from './axios';
import type { Athlete, AthleteSeasonData } from '../types/athlete.ts';
import type { ApiAthlete } from '../types/analytics';

export interface InviteResponse {
  msg: string;
  invite?: {
    status: string;
    email?: string;
    sentAt?: string;
    token?: string;
  };
  athleteId?: string;
  teamId?: string;
  token?: string;
}

export const athleteService = {
  /**
   * Get all athletes for the current team and season
   */
    async getAthletes(seasonYear?: number, opts?: { activeOnly?: boolean }): Promise<ApiAthlete[]> {
        const response = await axiosInstance.get<ApiAthlete[]>('/athletes', {
      // Omit `season` entirely when the caller didn't pick one: the server
      // resolves the team's active season (which accounts for imported data).
      // Sending a calendar year here would override that resolution and put
      // every screen back on a season the team may have no data for.
      params: {
        ...(seasonYear ? { season: seasonYear } : {}),
        activeOnly: opts?.activeOnly ?? true,
      }
    });
    return response.data;
  },

  /** Most recent races for an athlete, most recent first — used to seed VDOT/pace calculations. */
  async getRecentRaces(
    athleteId: string,
    limit = 5
  ): Promise<Array<{ id: string; raceName: string; date: string; distance: number; time: number }>> {
    const response = await axiosInstance.get(`/athletes/${athleteId}/races`, { params: { limit } });
    return response.data;
  },

  async inviteAthlete(athleteId: string, email: string): Promise<InviteResponse> {
    const response = await axiosInstance.post<InviteResponse>(`/athletes/${athleteId}/invite`, { email });
    return response.data;
  },

  async acceptInvite(token: string): Promise<InviteResponse> {
    const response = await axiosInstance.post<InviteResponse>('/athletes/accept-invite', { token });
    return response.data;
  },

  /**
   * Get a single athlete by ID with their complete history
   */
  async getAthlete(athleteId: string): Promise<Athlete> {
    const response = await axiosInstance.get<Athlete>(`/athletes/${athleteId}`);
    return response.data;
  },

  /**
   * Get season data for a specific athlete and year
   */
  async getAthleteSeason(athleteId: string, year: number): Promise<AthleteSeasonData> {
    const response = await axiosInstance.get<AthleteSeasonData>(
      `/athletes/${athleteId}/seasons/${year}`
    );
    return response.data;
  },

  /**
   * Update athlete information
   */
  async updateAthlete(athleteId: string, data: Partial<Athlete>): Promise<Athlete> {
    const response = await axiosInstance.patch<Athlete>(`/athletes/${athleteId}`, data);
    return response.data;
  }
};
