import api from './api';

export type LeverConfidence = 'measured' | 'ceiling' | 'context' | 'gap';

export interface StrategyLever {
  id: string;
  title: string;
  detail: string;
  /** Seconds this lever is worth, or null when it isn't a number. */
  seconds: number | null;
  confidence: LeverConfidence;
  evidence: Record<string, unknown>;
}

export interface PlanSplit {
  label: string;
  meters: number;
  cumulativeSec: number;
  segmentSec: number;
}

export interface RacePlan {
  targetTimeSec: number;
  distanceMeters: number;
  splits: PlanSplit[];
}

export interface Strategy {
  targetSec: number;
  distanceMeters: number;
  raceCount: number;
  bestTimeSec: number | null;
  targetTimeSec: number | null;
  targetTimeLabel: string | null;
  /** Only levers backed by races already run. A ceiling is not seconds in the bank. */
  measuredTotalSec: number;
  ceilingTotalSec: number;
  withinReach: boolean;
  bestRaceName: string | null;
  /** The splits to actually run for the goal time. Even pace — any other shape would be an opinion. */
  plan: RacePlan | null;
  /** One thing to do on race day, from this athlete's own pattern. */
  instruction: string;
  levers: StrategyLever[];
  gaps: StrategyLever[];
}

export interface StrategyRace {
  raceId: string;
  raceName: string;
  date: string;
  season: number;
  timeSec: number;
  distanceMeters: number;
  paceSecPerMile: number | null;
}

export interface StrategyResponse {
  athlete: { id: string; name: string };
  strategy: Strategy;
  races?: StrategyRace[];
  distances: Array<{ distanceMeters: number; raceCount: number }>;
}

export const strategyService = {
  async get(athleteId: string, opts?: { targetSec?: number; distanceMeters?: number; season?: number }) {
    const response = await api.get<StrategyResponse>(`/analytics/athlete/${athleteId}/strategy`, {
      params: {
        ...(opts?.targetSec ? { targetSec: opts.targetSec } : {}),
        ...(opts?.distanceMeters ? { distanceMeters: opts.distanceMeters } : {}),
        ...(opts?.season ? { season: opts.season } : {}),
      },
    });
    return response.data;
  },
};
