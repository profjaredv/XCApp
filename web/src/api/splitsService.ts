import { axiosInstance } from './axios';
import type { RaceSplit, SplitFormData } from '../types/splits';

export const splitsService = {
  async getRaceSplits(raceId: string): Promise<RaceSplit[]> {
    const response = await axiosInstance.get<RaceSplit[]>(`/splits/race/${raceId}`);
    return response.data;
  },

  async getAthleteSplits(athleteId: string): Promise<RaceSplit[]> {
    const response = await axiosInstance.get<RaceSplit[]>(`/splits/athlete/${athleteId}`);
    return response.data;
  },

  async saveSplitsBatch(splits: SplitFormData[]): Promise<{ success: boolean; count: number; splits: RaceSplit[] }> {
    const response = await axiosInstance.post('/splits/batch', { splits });
    return response.data;
  },

  async updateSplit(splitId: string, data: { mile1: number; mile2: number; mile3: number }): Promise<RaceSplit> {
    const response = await axiosInstance.put(`/splits/${splitId}`, data);
    return response.data;
  },

  async deleteSplit(splitId: string): Promise<{ success: boolean }> {
    const response = await axiosInstance.delete(`/splits/${splitId}`);
    return response.data;
  }
};
