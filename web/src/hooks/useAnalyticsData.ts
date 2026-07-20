import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/api/analyticsService';
import { athleteService } from '../api/athleteService';
import { teamService } from '../api/teamService';
import { meetService } from '../api/meetService';
import { transformAthlete, transformMeet } from '../utils/dataTransformers';
import type { AnalyticsData, Athlete, Meet, ApiAthlete, ApiMeet } from '../types/analytics';

/**
 * Hook to fetch available seasons with data
 */
export const useAvailableSeasons = (teamId?: string) => {
  return useQuery<number[], Error>({
    enabled: !!teamId,
    queryKey: ['availableSeasons'],
    queryFn: async () => {
      try {
        return await teamService.getAvailableSeasons();
      } catch (error) {
        console.error('Failed to fetch available seasons:', error);
        // Return current year as fallback
        return [new Date().getFullYear()];
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });
};

const ANALYTICS_QUERY_KEY = 'analytics';

export const useAnalyticsData = (preferredSeason?: number) => {
  console.log('useAnalyticsData hook executed with preferredSeason:', preferredSeason);
  
  // Fetch all data with fallback to previous years if needed
  const { data, isLoading, error, refetch } = useQuery<AnalyticsData, Error>({
    queryKey: [ANALYTICS_QUERY_KEY, 'overview', preferredSeason],
    queryFn: () => analyticsService.getAnalyticsOverview(preferredSeason!),
    enabled: !!preferredSeason, // Only run the query when a season is selected
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Return the data in the expected format
  return {
    data: data || null,
    isLoading,
    error,
    refetch
  };
};

// Hook to fetch a single athlete's data
export const useAthleteData = (athleteId: string) => {
  return useQuery<Athlete, Error>({
    queryKey: ['athlete', athleteId],
    queryFn: async () => {
      const data = await athleteService.getAthlete(athleteId);
      return transformAthlete(data as unknown as ApiAthlete);
    },
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000,
  });
};

// Hook to fetch a single meet's data
export const useMeetData = (meetId: string) => {
  return useQuery<Meet, Error>({
    queryKey: ['meet', meetId],
    queryFn: async () => {
      const data = await meetService.getMeet(meetId);
      return transformMeet(data as unknown as ApiMeet);
    },
    enabled: !!meetId,
    staleTime: 5 * 60 * 1000,
  });
};
