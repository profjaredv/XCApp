import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import dataManagementService, {
  ClearDataResponse,
  ImportDataResponse,
  CalculateMetricsResponse
} from '../api/dataManagementService';

// Every screen downstream of "this team's race/season data changed" —
// import, clear, and (re)calculate all land here. Without this, importing
// a season (or recalculating metrics for one) left every cached query
// showing whatever it had before: the season picker missing the new year,
// and the Program tab in particular showing stale or pre-import numbers
// until either a hard refresh or its own 5-minute staleTime happened to
// lapse.
const invalidateAfterDataChange = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['availableSeasons'] });
  queryClient.invalidateQueries({ queryKey: ['seasons'] });
  queryClient.invalidateQueries({ queryKey: ['currentSeason'] });
  queryClient.invalidateQueries({ queryKey: ['teamContext'] });
  queryClient.invalidateQueries({ queryKey: ['programAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['bandAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['bandAnalyticsCourses'] });
  queryClient.invalidateQueries({ queryKey: ['performance'] });
  queryClient.invalidateQueries({ queryKey: ['teamPerformance'] });
};

interface ClearDataParams {
  teamId: string;
  season: string;
}

interface ImportDataParams {
  teamId: string;
  season: string;
  athleticNetTeamId: string;
}

interface CalculateMetricsParams {
  teamId: string;
  season: string;
}

/**
 * Hook for clearing data for a specific team and season
 */
export const useClearData = (): UseMutationResult<
  ClearDataResponse,
  Error,
  ClearDataParams
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, season }: ClearDataParams) => dataManagementService.clearData(teamId, season),
    onSuccess: () => invalidateAfterDataChange(queryClient),
  });
};

/**
 * Hook for importing data for a specific team and season
 */
export const useImportData = (): UseMutationResult<
  ImportDataResponse,
  Error,
  ImportDataParams
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, season, athleticNetTeamId }: ImportDataParams) =>
      dataManagementService.importData(teamId, season, athleticNetTeamId),
    onSuccess: () => invalidateAfterDataChange(queryClient),
  });
};

/**
 * Hook for calculating metrics for a specific team and season
 */
export const useCalculateMetrics = (): UseMutationResult<
  CalculateMetricsResponse,
  Error,
  CalculateMetricsParams
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, season }: CalculateMetricsParams) =>
      dataManagementService.calculateMetrics(teamId, season),
    onSuccess: () => invalidateAfterDataChange(queryClient),
  });
};

/**
 * Hook for calculating enhanced metrics for a specific team and season
 */
export const useCalculateEnhancedMetrics = (): UseMutationResult<
  CalculateMetricsResponse,
  Error,
  CalculateMetricsParams
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, season }: CalculateMetricsParams) =>
      dataManagementService.calculateEnhancedMetrics(teamId, season),
    onSuccess: () => invalidateAfterDataChange(queryClient),
  });
};
