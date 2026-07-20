import { useQuery, UseQueryResult } from '@tanstack/react-query';
import enhancedAnalyticsService, {
  EnhancedTeamMetrics,
  EnhancedAthleteMetrics,
  DistanceAnalysis,
  RaceComparison
} from '../api/enhancedAnalyticsService';

/**
 * Hook for fetching enhanced team metrics
 */
export const useEnhancedTeamMetrics = (
  teamId: string,
  season: string,
  enabled: boolean = true
): UseQueryResult<EnhancedTeamMetrics, Error> => {
  return useQuery({
    queryKey: ['enhancedTeamMetrics', teamId, season],
    queryFn: () => enhancedAnalyticsService.getEnhancedTeamMetrics(teamId, season),
    enabled: enabled && !!teamId && !!season,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook for fetching enhanced athlete metrics
 */
export const useEnhancedAthleteMetrics = (
  athleteId: string,
  season: string,
  enabled: boolean = true
): UseQueryResult<EnhancedAthleteMetrics, Error> => {
  return useQuery({
    queryKey: ['enhancedAthleteMetrics', athleteId, season],
    queryFn: () => enhancedAnalyticsService.getEnhancedAthleteMetrics(athleteId, season),
    enabled: enabled && !!athleteId && !!season,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook for fetching distance analysis
 */
export const useDistanceAnalysis = (
  teamId: string,
  season: string,
  enabled: boolean = true
): UseQueryResult<DistanceAnalysis, Error> => {
  return useQuery({
    queryKey: ['distanceAnalysis', teamId, season],
    queryFn: () => enhancedAnalyticsService.getDistanceAnalysis(teamId, season),
    enabled: enabled && !!teamId && !!season,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook for fetching race comparisons
 */
export const useRaceComparisons = (
  athleteId: string,
  enabled: boolean = true
): UseQueryResult<RaceComparison[], Error> => {
  return useQuery({
    queryKey: ['raceComparisons', athleteId],
    queryFn: () => enhancedAnalyticsService.getRaceComparisons(athleteId),
    enabled: enabled && !!athleteId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
