import { useQueryClient } from '@tanstack/react-query';

export function useInvalidatePerformanceCache() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['performance'] });
    queryClient.invalidateQueries({ queryKey: ['teamPerformance'] });
    queryClient.invalidateQueries({ queryKey: ['athletePerformance'] });
    queryClient.invalidateQueries({ queryKey: ['teamSeasonSeries'] });
  };

  return {
    invalidateAll,
    invalidateTeamPerformance: (teamId: string) => {
      queryClient.invalidateQueries({ queryKey: ['teamPerformance', teamId] });
    },
    invalidateAthletePerformance: (athleteId: string) => {
      queryClient.invalidateQueries({ queryKey: ['athletePerformance', athleteId] });
    },
    invalidateTeamSeasonSeries: (teamId: string, seasonId: string) => {
      queryClient.invalidateQueries({ queryKey: ['teamSeasonSeries', teamId, seasonId] });
    },
  };
}
