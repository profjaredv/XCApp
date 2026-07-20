import { useMutation, UseMutationResult } from '@tanstack/react-query';
import dataManagementService, {
  ClearDataResponse,
  ImportDataResponse,
  CalculateMetricsResponse
} from '../api/dataManagementService';

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
  return useMutation({
    mutationFn: ({ teamId, season }: ClearDataParams) => dataManagementService.clearData(teamId, season)
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
  return useMutation({
    mutationFn: ({ teamId, season, athleticNetTeamId }: ImportDataParams) => 
      dataManagementService.importData(teamId, season, athleticNetTeamId)
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
  return useMutation({
    mutationFn: ({ teamId, season }: CalculateMetricsParams) => 
      dataManagementService.calculateMetrics(teamId, season)
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
  return useMutation({
    mutationFn: ({ teamId, season }: CalculateMetricsParams) => 
      dataManagementService.calculateEnhancedMetrics(teamId, season)
  });
};
