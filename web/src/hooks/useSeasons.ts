import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { seasonService } from '../api/seasonService';

export interface Season {
  _id: string;
  year: number;
  sport: 'XC' | 'Track';
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  roster: Array<{
    athlete: {
      _id: string;
      name: string;
      gender: 'M' | 'F';
    };
    grade: number;
    isActive: boolean;
  }>;
}

export function useSeasons(sport: 'XC' | 'Track' = 'XC') {
  return useQuery<Season[], Error>({
    queryKey: ['seasons', sport],
    queryFn: () => seasonService.getSeasons(sport),
  });
}

export function useCurrentSeason(sport: 'XC' | 'Track' = 'XC') {
  return useQuery<Season | null, Error>({
    queryKey: ['currentSeason', sport],
    queryFn: () => seasonService.getCurrentSeason(sport),
    // Return null instead of throwing if no active season
    retry: false
  });
}

export function useCreateSeason() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { year: number; sport: 'XC' | 'Track'; startDate?: Date; endDate?: Date }) => 
      seasonService.createSeason(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['seasons', variables.sport] });
    },
  });
}

export function useUpdateSeason() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { id: string; isActive?: boolean; startDate?: Date; endDate?: Date }) => 
      seasonService.updateSeason(data.id, {
        isActive: data.isActive,
        startDate: data.startDate,
        endDate: data.endDate,
      }),
    onSuccess: (data: Season) => {
      queryClient.invalidateQueries({ queryKey: ['seasons', data.sport] });
      queryClient.invalidateQueries({ queryKey: ['currentSeason', data.sport] });
    },
  });
}

export function useSeasonRoster(seasonId: string | null) {
  return useQuery<Season['roster'], Error>({
    queryKey: ['seasonRoster', seasonId],
    queryFn: () => seasonId ? seasonService.getSeasonRoster(seasonId) : Promise.reject('No season ID'),
    enabled: !!seasonId,
  });
}

export function useAddAthleteToRoster() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { seasonId: string; athletes: Array<{ id: string; grade: number }> }) => 
      seasonService.addAthletesToRoster(data.seasonId, data.athletes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['seasonRoster', variables.seasonId] });
    },
  });
}

export function useRemoveAthleteFromRoster() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { seasonId: string; athleteId: string }) => 
      seasonService.removeAthleteFromRoster(data.seasonId, data.athleteId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['seasonRoster', variables.seasonId] });
    },
  });
}
