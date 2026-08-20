import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meetOpsService } from '../api/meetOpsService';

export function useMeets(seasonId: string | null) {
  return useQuery({
    queryKey: ['meetOps', seasonId],
    queryFn: () => meetOpsService.listMeets(seasonId as string),
    enabled: !!seasonId,
  });
}

export function useMeet(meetId: string | null) {
  return useQuery({
    queryKey: ['meetOps', 'meet', meetId],
    queryFn: () => meetOpsService.getMeet(meetId as string),
    enabled: !!meetId,
  });
}

export function useCreateMeet(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; date: string; location?: string; isHome?: boolean | null }) =>
      meetOpsService.createMeet({ seasonId: seasonId as string, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetOps', seasonId] }),
  });
}

export function useUpdateMeet(meetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<{ name: string; date: string; location: string; isHome: boolean | null }>) =>
      meetOpsService.updateMeet(meetId as string, input),
    // Broad invalidation (no exact match) catches both this meet's detail
    // query (['meetOps', 'meet', meetId]) and every season's list query
    // (['meetOps', seasonId]) in one call — a rename/date change can move a
    // meet's chronological position in the list too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetOps'] }),
  });
}

export function useMyMeetCard(enabled = true) {
  return useQuery({
    queryKey: ['myMeetCard'],
    queryFn: () => meetOpsService.myMeetCard(),
    enabled,
  });
}

export function useProposeImport(seasonId: string | null) {
  return useMutation({
    mutationFn: () => meetOpsService.proposeImport(seasonId as string),
  });
}

export function useConfirmImport(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (meets: Array<{ name: string; date: string; location?: string | null; raceIds: string[] }>) =>
      meetOpsService.confirmImport(seasonId as string, meets),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetOps', seasonId] }),
  });
}

export function useProposeCalendarImport(seasonId: string | null) {
  return useMutation({
    mutationFn: () => meetOpsService.proposeCalendarImport(seasonId as string),
  });
}

export function useConfirmCalendarImport(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (meets: Array<{ athleticMeetId: string; name: string; date: string; location?: string | null }>) =>
      meetOpsService.confirmCalendarImport(seasonId as string, meets),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetOps', seasonId] }),
  });
}
