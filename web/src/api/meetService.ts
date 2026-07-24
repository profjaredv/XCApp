import { axiosInstance } from './axios';
import type { ApiMeet, Meet, Race } from '../types/analytics';

export const meetService = {
  /**
   * Get all meets for the current team and season
   */
    async getMeets(seasonYear?: number): Promise<ApiMeet[]> {
        const response = await axiosInstance.get<ApiMeet[]>('/meets', {
      params: seasonYear ? { season: seasonYear } : {}
    });
    return response.data;
  },

  /**
   * Get a single meet by ID with all results
   */
    async getMeet(meetId: string): Promise<ApiMeet> {
    const response = await axiosInstance.get<ApiMeet>(`/meets/${meetId}`);
    return response.data;
  },

  /**
   * Get race results for a specific meet
   */
  async getMeetResults(meetId: string): Promise<Race[]> {
    const response = await axiosInstance.get<Race[]>(`/meets/${meetId}/results`);
    return response.data;
  },

  /**
   * Create a new meet
   */
  async createMeet(data: Omit<Meet, 'id' | 'createdAt' | 'updatedAt'>): Promise<Meet> {
    const response = await axiosInstance.post<Meet>('/meets', data);
    return response.data;
  },

  /**
   * Update meet information
   */
  async updateMeet(meetId: string, data: Partial<Meet>): Promise<Meet> {
    const response = await axiosInstance.patch<Meet>(`/meets/${meetId}`, data);
    return response.data;
  }
};
