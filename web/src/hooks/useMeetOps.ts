import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meetOpsService, type RaceResultEntry, type PostseasonLevel } from '../api/meetOpsService';
import { invalidateAfterDataChange } from './useDataManagement';

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

/** Sets the postseason level for every race in a meet. */
export function useSetPostseasonLevel(meetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (level: PostseasonLevel | null) => meetOpsService.setPostseasonLevel(meetId as string, level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetOps'] });
      // The Program screen counts who reached each round from these marks.
      queryClient.invalidateQueries({ queryKey: ['programAnalytics'] });
    },
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

// A race that never touched the Athletic.net scraper (e.g. an in-house
// track time trial) — see Race.isManual's schema comment. Invalidation is
// the same broad set the data-import flow uses: adding a race or results
// is exactly the kind of "team's race data changed" event that must
// refresh the season picker, Program tab, and band charts, not just this
// meet's own detail view.
export function useCreateRace(meetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; date?: string; distanceMeters: number; distance?: string }) =>
      meetOpsService.createRace(meetId as string, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetOps'] });
      invalidateAfterDataChange(queryClient);
    },
  });
}

export function useDeleteRace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (raceId: string) => meetOpsService.deleteRace(raceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetOps'] });
      invalidateAfterDataChange(queryClient);
    },
  });
}

// Unfinished Live Timer drafts for a race — RaceLiveTimerPage offers to
// resume one instead of silently starting fresh over lost captures.
export function useTimerSessions(raceId: string | null) {
  return useQuery({
    queryKey: ['meetOps', 'timerSessions', raceId],
    queryFn: () => meetOpsService.listTimerSessions(raceId as string),
    enabled: !!raceId,
  });
}

export function useRaceResults(raceId: string | null) {
  return useQuery({
    queryKey: ['meetOps', 'raceResults', raceId],
    queryFn: () => meetOpsService.getRaceResults(raceId as string),
    enabled: !!raceId,
  });
}

// Only wraps the user-facing "Resume" screen's Discard action in a proper
// mutation (for its pending state) — the actual autosave-as-you-go
// create/update calls happen as plain best-effort service calls straight
// from RaceLiveTimerPage, not react-query mutations, since nothing in the
// UI needs to show them as pending.
export function useDeleteTimerSession(raceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => meetOpsService.deleteTimerSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetOps', 'timerSessions', raceId] }),
  });
}

export function useSubmitRaceResults(raceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (results: RaceResultEntry[]) => meetOpsService.submitRaceResults(raceId as string, results),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetOps', 'raceResults', raceId] });
      invalidateAfterDataChange(queryClient);
    },
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
