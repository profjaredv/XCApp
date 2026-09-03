import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/axios';

export interface ProgramBenchmark {
  league: number | null;
  state: number | null;
  national: number | null;
}

export interface ProgramMedianPace {
  paceSecPerMile: number | null;
  athleteCount: number;
}

export interface ProgramPackSpread {
  spreadSec: number;
  raceId: string;
  raceName: string | null;
  date: string | null;
}

export interface ProgramSeasonEntry {
  season: number;
  participants: { total: number; men: number; women: number };
  /** Legacy: from TeamSeasonMetrics, so null until a season is calculated. Prefer raceMiles. */
  milesLogged: number | null;
  metricsCalculated: boolean;
  topField: { men: number | null; women: number | null };
  benchmarks: { men: ProgramBenchmark; women: ProgramBenchmark };

  // Computed live from results — present for every season with racing,
  // calculated or not.
  meets: number;
  racesRun: number;
  racedCount: number;
  raceMiles: number;
  racesPerAthlete: number | null;
  milesPerAthlete: number | null;
  racedShare: number | null;
  medianPace: { men: ProgramMedianPace; women: ProgramMedianPace };
  packSpread: { men: ProgramPackSpread | null; women: ProgramPackSpread | null };
  churn: {
    returning: number | null;
    newcomers: number | null;
    previousSize: number | null;
    returnRate: number | null;
  };
}

/** One sentence of story mode, with the number it rests on. See backend/lib/programStory.js. */
export interface ProgramStoryBeat {
  id: string;
  kind: 'growth' | 'retention' | 'speed' | 'depth' | 'gap';
  headline: string;
  detail: string;
  evidence: Record<string, unknown>;
}

// Retention/cohortSizes keys are JSON-serialized numbers (the windows,
// e.g. 1/2/3/4 years) — object keys are always strings once they cross
// the wire, hence Record<string, ...> rather than Record<number, ...>.
export interface ProgramAttrition {
  windows: number[];
  retention: Record<string, number | null>;
  cohortSizes: Record<string, number>;
  /** Athletes whose first season IS the earliest loaded one, so "joined" can't be distinguished from "first appears". */
  leftCensored?: number;
  earliestSeason?: number | null;
}

export interface ProgramAnalyticsData {
  success: boolean;
  seasons: ProgramSeasonEntry[];
  attrition: ProgramAttrition;
  story: ProgramStoryBeat[];
}

export const useProgramAnalytics = () => {
  return useQuery<ProgramAnalyticsData, Error>({
    queryKey: ['programAnalytics'],
    queryFn: async () => {
      const response = await api.get<ProgramAnalyticsData>('/analytics/program');
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};
