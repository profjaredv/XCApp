import { axiosInstance } from './axios';

export type TrainingLogType = 'easy' | 'long' | 'tempo' | 'interval' | 'race' | 'other';

export interface TrainingLog {
  id: string;
  athleteId: string;
  date: string;
  type: TrainingLogType;
  distanceMi: number | null;
  durationSec: number | null;
  notes: string | null;
  createdAt: string;
}

export interface NewTrainingLog {
  date: string;
  type: TrainingLogType;
  distanceMi?: number;
  durationSec?: number;
  notes?: string;
}

export const trainingLogService = {
  async getMyLogs(limit = 50): Promise<TrainingLog[]> {
    const response = await axiosInstance.get<TrainingLog[]>('/athletes/me/training-logs', {
      params: { limit },
    });
    return response.data;
  },

  async logRun(input: NewTrainingLog): Promise<TrainingLog> {
    const response = await axiosInstance.post<TrainingLog>('/athletes/me/training-logs', input);
    return response.data;
  },

  async deleteLog(logId: string): Promise<void> {
    await axiosInstance.delete(`/athletes/me/training-logs/${logId}`);
  },
};
