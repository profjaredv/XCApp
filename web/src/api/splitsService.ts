import { axiosInstance } from './axios';
import type {
  RaceSplitsView,
  AthleteSplitHistoryRow,
  AthleteSplitsAggregateResponse,
  BatchSplitEntry,
  BatchSplitResponse,
} from '../types/splits';

// C8 (LeadPack Master Build Handoff): rewritten against the marker-based
// Split model / backend/routes/splits.js.
export const splitsService = {
  async getRaceSplits(raceId: string): Promise<RaceSplitsView> {
    const response = await axiosInstance.get<RaceSplitsView>(`/splits/race/${raceId}`);
    return response.data;
  },

  async getAthleteSplits(athleteId: string): Promise<AthleteSplitHistoryRow[]> {
    const response = await axiosInstance.get<AthleteSplitHistoryRow[]>(`/splits/athlete/${athleteId}`);
    return response.data;
  },

  // C10: per-distance-bucket averages (Mile 1/2/.../closing/pace, typical
  // split pattern) — never recomputed client-side, see lib/splitAggregates.js.
  async getAthleteSplitsAggregate(athleteId: string): Promise<AthleteSplitsAggregateResponse> {
    const response = await axiosInstance.get<AthleteSplitsAggregateResponse>(`/splits/athlete/${athleteId}/aggregate`);
    return response.data;
  },

  async saveSplitsBatch(raceId: string, entries: BatchSplitEntry[]): Promise<BatchSplitResponse> {
    const response = await axiosInstance.post<BatchSplitResponse>('/splits/batch', { raceId, entries });
    return response.data;
  },

  async deleteSplit(splitId: string): Promise<{ success: boolean }> {
    const response = await axiosInstance.delete(`/splits/${splitId}`);
    return response.data;
  },
};
