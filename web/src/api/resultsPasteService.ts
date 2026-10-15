import { axiosInstance as api } from '@/api/axios';
import type { GridPayload } from '@/lib/gridTextParse';

// The two backend/routes/teams.js endpoints behind "Update results":
// preview (read-only: what would this paste do?) and commit (do it).

export type AthleteDecision = { action: 'existing'; athleteId: string } | { action: 'new' };
export type MeetDecision = { action: 'existing'; meetId: string } | { action: 'new' };

export interface PasteDecisions {
  athletes: Record<string, AthleteDecision>;
  meets: Record<string, MeetDecision>;
}

export interface PlanMeet {
  key: string;
  name: string;
  date: string; // YYYY-MM-DD
  distances: string[];
  status: 'existing' | 'new' | 'review';
  existingName?: string;
  candidates?: Array<{ id: string; name: string; date: string }>;
  reviewReason?: string;
}

export interface PlanAthlete {
  key: string;
  gender: 'Men' | 'Women';
  name: string;
  grade: number | null;
  status: 'existing' | 'new' | 'review';
  matchedBy?: string;
  candidates?: Array<{ id: string; name: string; graduationYear: number | null; gender: string | null }>;
  reviewReason?: string;
}

export interface PlanSummary {
  newMeets: number;
  newRaces: number;
  newAthletes: number;
  newResults: number;
  changedResults: number;
  unchanged: number;
  needsReview: number;
  notInPaste: number;
}

export interface PastePlan {
  errors: string[];
  meets: PlanMeet[];
  athletes: PlanAthlete[];
  summary: PlanSummary;
  /** For cells with two times: the time LeadPack already holds, so a re-paste keeps the earlier choice. */
  preselect: Record<string, string>;
  hasChanges: boolean;
}

interface Request {
  season: number;
  grids: GridPayload[];
  decisions: PasteDecisions;
}

export const resultsPasteService = {
  async preview(body: Request): Promise<PastePlan> {
    return (await api.post<PastePlan>('/teams/results-paste/preview', body)).data;
  },
  async commit(body: Request): Promise<{ applied: boolean; message: string; summary: PlanSummary }> {
    return (await api.post<{ applied: boolean; message: string; summary: PlanSummary }>('/teams/results-paste/commit', body)).data;
  },
};
