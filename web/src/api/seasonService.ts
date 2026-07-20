import { axiosInstance } from './axios';
import { Season } from '../hooks/useSeasons';

interface SeasonCreateData {
  year: number;
  sport: 'XC' | 'Track';
  startDate?: Date;
  endDate?: Date;
}

interface SeasonUpdateData {
  isActive?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export const seasonService = {
  /**
   * Get all seasons for the current team
   */
  async getSeasons(sport: 'XC' | 'Track' = 'XC'): Promise<Season[]> {
    const response = await axiosInstance.get<Season[]>('/seasons', {
      params: { sport }
    });
    return response.data;
  },

  /**
   * Get the current active season for the team
   */
  async getCurrentSeason(sport: 'XC' | 'Track' = 'XC'): Promise<Season> {
    const response = await axiosInstance.get<Season>('/seasons/current', {
      params: { sport }
    });
    return response.data;
  },

  /**
   * Create a new season
   */
  async createSeason(data: SeasonCreateData): Promise<Season> {
    const response = await axiosInstance.post<Season>('/seasons', data);
    return response.data;
  },

  /**
   * Update a season
   */
  async updateSeason(seasonId: string, data: SeasonUpdateData): Promise<Season> {
    const response = await axiosInstance.put<Season>(`/seasons/${seasonId}`, data);
    return response.data;
  },

  /**
   * Get roster for a season
   */
  async getSeasonRoster(seasonId: string, activeOnly: boolean = true): Promise<Season['roster']> {
    const response = await axiosInstance.get<Season['roster']>(`/seasons/${seasonId}/roster`, {
      params: { activeOnly }
    });
    return response.data;
  },

  /**
   * Add athletes to a season roster
   */
  async addAthletesToRoster(seasonId: string, athletes: Array<{ id: string; grade: number }>): Promise<Season> {
    const response = await axiosInstance.post<Season>(`/seasons/${seasonId}/roster`, {
      athletes
    });
    return response.data;
  },

  /**
   * Remove an athlete from a season roster
   */
  async removeAthleteFromRoster(seasonId: string, athleteId: string): Promise<{ msg: string }> {
    const response = await axiosInstance.delete<{ msg: string }>(`/seasons/${seasonId}/roster/${athleteId}`);
    return response.data;
  },

  /**
   * Clear all results for a season before scraping new data
   */
  async clearSeasonResults(seasonId: string): Promise<{ success: boolean; count: number }> {
    const response = await axiosInstance.delete<{ success: boolean; count: number }>(`/seasons/${seasonId}/results`);
    return response.data;
  }
};
