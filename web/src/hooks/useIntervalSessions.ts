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

// The Manage page fetches by id directly rather than pulling the whole
// season's list and finding it — works from a bookmarked/shared link
// without needing the season context to load first.
export function useIntervalSession(id: string | null) {
  return useQuery({
    queryKey: ['intervalSession', id],
    queryFn: () => intervalSessionService.get(id as string),
    enabled: !!id,
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

export function useSetIntervalSessionArchived(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      intervalSessionService.setArchived(id, archived),
    onSuccess: (_data, { id }) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['intervalSession', id] });
    },
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
