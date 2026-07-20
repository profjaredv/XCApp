import { useQuery } from '@tanstack/react-query';
import { performanceService } from '@/api/performanceService';
import { TeamSeasonSeriesPoint } from '@/types/performance';

export interface TeamSeasonSeriesData {
  series: TeamSeasonSeriesPoint[];
  trend: {
    slope: number;
    percentChange: number;
  };
}

export function useTeamSeasonSeries(teamId?: string, seasonId?: string) {
  return useQuery<TeamSeasonSeriesData>({
    queryKey: ['teamSeasonSeries', teamId, seasonId],
    queryFn: async (): Promise<TeamSeasonSeriesData> => {
      if (!teamId || !seasonId) {
        return { series: [], trend: { slope: 0, percentChange: 0 } };
      }
      
      const response = await performanceService.getTeamSeasonSeries(teamId, parseInt(seasonId, 10));
      return response.data;
    },
    enabled: !!teamId && !!seasonId,
  });
}
