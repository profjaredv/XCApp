import { api } from './axios';

// GET /api/analytics/athlete/:athleteId/footsteps — see backend/lib/footsteps.js.

export interface FootstepsPoint {
  grade: number;
  paceSecPerMile: number;
  fiveKSec: number;
}

export interface FootstepsMatch {
  /** Present only for a coach. An athlete or guardian never receives another student's id or name. */
  athleteId?: string;
  name?: string;
  /** The name for a coach; "Class of 2022" for everyone else. */
  label: string;
  graduationYear: number;
  gapAtGradeSec: number;
  atGrade: FootstepsPoint;
  best: { paceSecPerMile: number; fiveKSec: number };
  lastGrade: number;
  /** 5K seconds gained after the shared grade. Positive = got faster. */
  gainSec: number;
  path: FootstepsPoint[];
}

export interface FootstepsProjection {
  grade: number;
  basedOn: number;
  improved: number;
  fiveKSec: number;
  fastestFiveKSec: number;
  slowestFiveKSec: number;
  medianChangeSec: number;
}

export interface Footsteps {
  status: 'ok' | 'few-matches' | 'no-matches' | 'final-year' | 'no-races' | 'no-class-year';
  athlete: { id: string; name: string; graduationYear: number | null };
  self: { fromGrade: number; paceSecPerMile: number; fiveKSec: number; path: FootstepsPoint[] } | null;
  namesShown: boolean;
  matches: FootstepsMatch[];
  projection: FootstepsProjection[];
  summary: {
    matchCount: number;
    toleranceSec: number;
    improvedCount: number;
    medianGainSec: number | null;
    projectedGrade: number | null;
    projectedFiveKSec: number | null;
  } | null;
  poolSize: number;
}

export const footstepsService = {
  async get(athleteId: string): Promise<Footsteps> {
    const response = await api.get<Footsteps>(`/analytics/athlete/${athleteId}/footsteps`);
    return response.data;
  },
};
