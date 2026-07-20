import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/axios';

export interface MultiSeasonTrendsData {
  seasons: number[];
  trends: {
    season: number;
    avg5K: {
      girls: number | null;
      boys: number | null;
      team: number | null;
    };
    avgPace: {
      girls: number | null;
      boys: number | null;
      team: number | null;
    };
    stateMeet: {
      avg5K: {
        girls: number | null;
        boys: number | null;
        team: number | null;
      };
      avgPace: {
        girls: number | null;
        boys: number | null;
        team: number | null;
      };
      hasData: boolean;
    };
    hasData: boolean;
  }[];
}

export const useMultiSeasonTrends = (teamId?: string, options = {}) => {
  return useQuery<MultiSeasonTrendsData, Error>({
    queryKey: ['multiSeasonTrends', teamId],
    queryFn: async () => {
      if (!teamId) {
        throw new Error('Team ID is required');
      }
      
      const response = await api.get<{ success: boolean; data: MultiSeasonTrendsData }>(
        `/multi-season/team/${teamId}/trends`
      );
      
      return response.data.data;
    },
    enabled: !!teamId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  });
};
