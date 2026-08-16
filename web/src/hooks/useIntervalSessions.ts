import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  intervalSessionService,
  type CreateIntervalSessionInput,
  type RepUpdateInput,
} from '../api/intervalSessionService';

export function useIntervalSessions(seasonId: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ['intervalSessions', seasonId, from, to],
    queryFn: () => intervalSessionService.list(seasonId as string, from, to),
    enabled: !!seasonId,
  });
}

function useInvalidateSessions(seasonId: string | null) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['intervalSessions', seasonId] });
}

export function useCreateIntervalSession(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: (input: CreateIntervalSessionInput) => intervalSessionService.create(input),
    onSuccess: invalidate,
  });
}

export function useDeleteIntervalSession(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: (id: string) => intervalSessionService.remove(id),
    onSuccess: invalidate,
  });
}

export function useAddIntervalEntry(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: ({ sessionId, athleteId }: { sessionId: string; athleteId: string }) =>
      intervalSessionService.addEntry(sessionId, athleteId),
    onSuccess: invalidate,
  });
}

export function useUpdateIntervalEntry(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: ({ entryId, input }: { entryId: string; input: RepUpdateInput }) =>
      intervalSessionService.updateEntry(entryId, input),
    onSuccess: invalidate,
  });
}

export function useRemoveIntervalEntry(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: (entryId: string) => intervalSessionService.removeEntry(entryId),
    onSuccess: invalidate,
  });
}
