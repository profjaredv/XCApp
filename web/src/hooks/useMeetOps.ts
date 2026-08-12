import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meetOpsService, type EntryStatus, type MeetPlan } from '../api/meetOpsService';

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
    mutationFn: (input: { name: string; date: string; location?: string }) =>
      meetOpsService.createMeet({ seasonId: seasonId as string, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetOps', seasonId] }),
  });
}

export function useEntries(raceId: string | null) {
  return useQuery({
    queryKey: ['meetEntries', raceId],
    queryFn: () => meetOpsService.getEntries(raceId as string),
    enabled: !!raceId,
  });
}

export function useSaveEntries(raceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      entries: Array<{ athleteId: string; status: EntryStatus; seedTimeSec?: number | null; bibNumber?: string | null; notes?: string | null }>
    ) => meetOpsService.saveEntries(raceId as string, entries),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetEntries', raceId] }),
  });
}

export function useMeetPlan(meetId: string | null) {
  return useQuery({
    queryKey: ['meetPlan', meetId],
    queryFn: () => meetOpsService.getPlan(meetId as string),
    enabled: !!meetId,
  });
}

export function useSaveMeetPlan(meetId: string | null, seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MeetPlan) => meetOpsService.savePlan(meetId as string, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetPlan', meetId] });
      queryClient.invalidateQueries({ queryKey: ['meetOps', seasonId] });
    },
  });
}

export function usePrintableRoster(meetId: string | null) {
  return useQuery({
    queryKey: ['meetRoster', meetId],
    queryFn: () => meetOpsService.getRoster(meetId as string),
    enabled: !!meetId,
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
