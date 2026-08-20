import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/axios';

export interface ProgramBenchmark {
  league: number | null;
  state: number | null;
  national: number | null;
}

export interface ProgramSeasonEntry {
  season: number;
  participants: { total: number; men: number; women: number };
  milesLogged: number | null;
  metricsCalculated: boolean;
  topField: { men: number | null; women: number | null };
  benchmarks: { men: ProgramBenchmark; women: ProgramBenchmark };
}

// Retention/cohortSizes keys are JSON-serialized numbers (the windows,
// e.g. 1/2/3/4 years) — object keys are always strings once they cross
// the wire, hence Record<string, ...> rather than Record<number, ...>.
export interface ProgramAttrition {
  windows: number[];
  retention: Record<string, number | null>;
  cohortSizes: Record<string, number>;
}

export interface ProgramAnalyticsData {
  success: boolean;
  seasons: ProgramSeasonEntry[];
  attrition: ProgramAttrition;
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
