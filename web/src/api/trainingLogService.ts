import { axiosInstance } from './axios';
import type { ActivitySource, ParsedRun } from '@/lib/activityFiles/types';

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
  // Private ("yours alone") unless the athlete opts in, at creation or
  // later via updateSharing below.
  sharedWithCoach: boolean;
  sharedWithTeam: boolean;
}

export interface ImportResult {
  batchId: string;
  parsed: number;
  created: number;
  /** Counts keyed by cause — 'alreadyImported', 'badType', 'empty',
   *  'duplicateInFile', 'future', 'tooOld', … — so the athlete is told
   *  WHY rows did not land, not just how many. */
  skipped: Record<string, number>;
}

export interface ImportBatch {
  id: string;
  source: string;
  fileName: string | null;
  rowsParsed: number;
  rowsCreated: number;
  rowsSkipped: number;
  createdAt: string;
}

export interface NewTrainingLog {
  date: string;
  type: TrainingLogType;
  distanceMi?: number;
  durationSec?: number;
  notes?: string;
  sharedWithCoach?: boolean;
  sharedWithTeam?: boolean;
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

  /** Post parsed runs in chunks. The server caps a request at 500 rows to
   *  stay inside express.json's 1mb limit, so a multi-year archive
   *  necessarily arrives as several requests. They are sent in sequence,
   *  not in parallel: the import rate limiter counts requests, and a burst
   *  of ten would trip it on a legitimate import.
   *
   *  Each chunk is its own batch. That is deliberate — a partial failure
   *  leaves complete, undoable batches rather than one half-written one. */
  async importRuns(
    source: ActivitySource,
    fileName: string,
    runs: ParsedRun[],
    sharing: { sharedWithCoach: boolean; sharedWithTeam: boolean }
  ): Promise<ImportResult[]> {
    const CHUNK = 500;
    const results: ImportResult[] = [];
    for (let i = 0; i < runs.length; i += CHUNK) {
      const response = await axiosInstance.post<ImportResult>('/athletes/me/training-logs/import', {
        source,
        fileName,
        runs: runs.slice(i, i + CHUNK),
        ...sharing,
      });
      results.push(response.data);
    }
    return results;
  },

  async getImports(): Promise<ImportBatch[]> {
    const response = await axiosInstance.get<ImportBatch[]>('/athletes/me/training-logs/imports');
    return response.data;
  },

  async undoImport(batchId: string): Promise<{ deleted: number }> {
    const response = await axiosInstance.delete<{ msg: string; deleted: number }>(
      `/athletes/me/training-logs/imports/${batchId}`
    );
    return response.data;
  },

  async updateSharing(logId: string, sharedWithCoach: boolean, sharedWithTeam: boolean): Promise<TrainingLog> {
    const response = await axiosInstance.put<TrainingLog>(`/athletes/me/training-logs/${logId}/sharing`, {
      sharedWithCoach,
      sharedWithTeam,
    });
    return response.data;
  },

  async deleteLog(logId: string): Promise<void> {
    await axiosInstance.delete(`/athletes/me/training-logs/${logId}`);
  },
};
