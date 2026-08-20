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

// Broad (no specific id) — invalidates every useIntervalSession(id) query
// currently cached. The Manage page renders entirely from that query's
// session.entries, and only ever has one such session mounted at a time,
// so this is simpler than threading a specific id through every mutation
// below just to target one cache entry.
function useInvalidateSingleSession() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['intervalSession'] });
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

export function useDuplicateIntervalSession(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: ({ id, groupId, date }: { id: string; groupId?: string | null; date?: string }) =>
      intervalSessionService.duplicate(id, { groupId, date }),
    onSuccess: invalidate,
  });
}

// Add/remove both refresh the specific session query too (not just the
// list) — without this, an athlete added or removed on the Manage page
// only ever showed up after closing and reopening it, since that page
// reads from useIntervalSession(id), which only useSetIntervalSessionArchived
// used to bother invalidating.
export function useAddIntervalEntry(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  const invalidateSession = useInvalidateSingleSession();
  return useMutation({
    mutationFn: ({ sessionId, athleteId }: { sessionId: string; athleteId: string }) =>
      intervalSessionService.addEntry(sessionId, athleteId),
    onSuccess: () => {
      invalidate();
      invalidateSession();
    },
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
  const invalidateSession = useInvalidateSingleSession();
  return useMutation({
    mutationFn: (entryId: string) => intervalSessionService.removeEntry(entryId),
    onSuccess: () => {
      invalidate();
      invalidateSession();
    },
  });
}
