import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postseasonService, type PostseasonLevel } from '@/api/postseasonService';

export function usePostseason(season: number | undefined) {
  return useQuery({
    queryKey: ['postseason', season],
    queryFn: () => postseasonService.get(season),
    enabled: season !== undefined,
  });
}

export function useSavePostseasonTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tags: Array<{ meetId: string; level: PostseasonLevel | null }>) => postseasonService.saveTags(tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postseason'] });
      // Program counts who reached each round from these tags, and the
      // season dashboards read metrics the server just recalculated.
      queryClient.invalidateQueries({ queryKey: ['programAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['meetOps'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });
}
