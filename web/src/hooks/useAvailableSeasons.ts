import { useQuery } from '@tanstack/react-query';
import { performanceService } from '@/api/performanceService';

export interface Season {
  id: string;
  year: number;
  name: string;
  isCurrent: boolean;
}

export function useAvailableSeasons(teamId?: string) {
  return useQuery<Season[]>({
    queryKey: ['availableSeasons', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const response = await performanceService.getTeamSeasons(teamId);
      return response.data;
    },
    select: (data) => {
      // Sort seasons by year in descending order (newest first)
      return [...data].sort((a, b) => b.year - a.year);
    },
    enabled: !!teamId,
  });
}
