import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { raceReflectionService } from '../api/raceReflectionService';

export function useMyReflection(raceId: string | null) {
  return useQuery({
    queryKey: ['myReflection', raceId],
    queryFn: () => raceReflectionService.getMine(raceId as string),
    enabled: !!raceId,
  });
}

export function useSavePreRace(raceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof raceReflectionService.savePreRace>[1]) =>
      raceReflectionService.savePreRace(raceId as string, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myReflection', raceId] }),
  });
}

export function useSavePostRace(raceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof raceReflectionService.savePostRace>[1]) =>
      raceReflectionService.savePostRace(raceId as string, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myReflection', raceId] }),
  });
}

export function useSetSharing(raceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sharedWithCoach: boolean) => raceReflectionService.setSharing(raceId as string, sharedWithCoach),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myReflection', raceId] }),
  });
}

export function useReflectionsForRace(raceId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['raceReflections', raceId],
    queryFn: () => raceReflectionService.getForRace(raceId as string),
    // Callers can add their own condition — a team that turned reflections
    // off would otherwise fire a request the API is going to refuse.
    enabled: !!raceId && options?.enabled !== false,
  });
}
