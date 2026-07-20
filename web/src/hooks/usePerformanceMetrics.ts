import { useQuery, useQueryClient } from '@tanstack/react-query';
import { performanceService, AthleteSeasonMetricsData } from '../api/performanceService';
import type { TeamPerformanceResponse, AthletePerformanceResponse, MeetPerformanceResponse, TeamSeasonSeriesResponse, PerformanceResponse } from '../types/performance';

type AthleteAllSeasonsResponse = PerformanceResponse<{ athleteId: string, seasons: AthleteSeasonMetricsData[] }>;

export const useTeamPerformance = (teamId: string, season: number, options = {}) => {
  return useQuery<TeamPerformanceResponse, Error>({
    queryKey: ['performance', 'team', teamId, season],
    queryFn: () => performanceService.getTeamMetrics(teamId, season),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options
  });
};

export const useAthletePerformance = (athleteId: string, season: number, options = {}) => {
  return useQuery<AthletePerformanceResponse, Error>({
    queryKey: ['performance', 'athlete', athleteId, season],
    queryFn: () => performanceService.getAthleteMetrics(athleteId, season),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options
  });
};

export const useAthleteAllSeasons = (athleteId: string, options = {}) => {
  return useQuery<AthleteAllSeasonsResponse, Error>({
    queryKey: ['performance', 'athlete', athleteId, 'all-seasons'],
    queryFn: () => performanceService.getAthleteAllSeasons(athleteId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options
  });
};

export const useMeetPerformance = (meetId: string, teamId: string, options = {}) => {
  return useQuery<MeetPerformanceResponse, Error>({
    queryKey: ['performance', 'meet', meetId, teamId],
    queryFn: () => performanceService.getMeetMetrics(meetId, teamId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options
  });
};

export const useTeamSeasonSeries = (teamId: string, season: number, options = {}) => {
  return useQuery<TeamSeasonSeriesResponse, Error>({
    queryKey: ['performance', 'team', teamId, season, 'series'],
    queryFn: () => performanceService.getTeamSeasonSeries(teamId, season),
    staleTime: 5 * 60 * 1000,
    ...options
  });
};

export const useInvalidatePerformanceCache = () => {
  const queryClient = useQueryClient();
  
  return (
    scope: 'all' | 'team' | 'athlete' | 'meet',
    ids?: { teamId?: string; athleteId?: string; meetId?: string; season?: number }
  ) => {
    const queryKey: (string | number)[] = ['performance'];
    
    switch (scope) {
      case 'team':
        if (ids?.teamId && ids?.season) {
          queryKey.push('team', ids.teamId, ids.season);
        } else if (ids?.teamId) {
          queryKey.push('team', ids.teamId);
        } else {
          queryKey.push('team');
        }
        break;
        
      case 'athlete':
        if (ids?.athleteId && ids?.season) {
          queryKey.push('athlete', ids.athleteId, ids.season);
        } else if (ids?.athleteId) {
          queryKey.push('athlete', ids.athleteId);
        } else {
          queryKey.push('athlete');
        }
        break;
        
      case 'meet':
        if (ids?.meetId && ids?.teamId) {
          queryKey.push('meet', ids.meetId, ids.teamId);
        } else if (ids?.meetId) {
          queryKey.push('meet', ids.meetId);
        } else {
          queryKey.push('meet');
        }
        break;
        
      case 'all':
      default:
        // Just use ['performance'] to match all performance queries
        break;
    }
    
    return queryClient.invalidateQueries({ queryKey });
  };
};
