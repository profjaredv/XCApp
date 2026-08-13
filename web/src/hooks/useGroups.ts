import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupService, type GroupType } from '../api/groupService';
import { teamService } from '../api/teamService';

/** Coaching staff eligible to lead a group — HEAD_COACH/COACH/VOLUNTEER_COACH, active only. */
export function useStaff() {
  return useQuery({
    queryKey: ['teamStaff'],
    queryFn: () => teamService.getStaff(),
    select: (data) => data.staff.filter((s) => s.active),
  });
}

export function useGroups(seasonId: string | null) {
  return useQuery({
    queryKey: ['groups', seasonId],
    queryFn: () => groupService.listGroups(seasonId as string),
    enabled: !!seasonId,
  });
}

/** An athlete's own current group(s) and members — the read-only counterpart to useGroups. */
export function useMyGroups() {
  return useQuery({
    queryKey: ['myGroups'],
    queryFn: () => groupService.getMyGroups(),
  });
}

export function useGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ['groupMembers', groupId],
    queryFn: () => groupService.listMembers(groupId as string),
    enabled: !!groupId,
  });
}

export function useAllGroupMembers(seasonId: string | null, groupIds: string[]) {
  return useQuery({
    queryKey: ['groupMembers', seasonId, groupIds],
    queryFn: () => groupService.listAllMembers(groupIds),
    enabled: !!seasonId && groupIds.length > 0,
  });
}

export function useRosterWithRaces(season: number | undefined) {
  return useQuery({
    queryKey: ['rosterWithRaces', season],
    queryFn: () => groupService.getRosterWithRaces(season as number),
    enabled: !!season,
  });
}

/**
 * `seasonId` is the roster-defining season (the one whose Group rows to
 * use — usually the current season). `dataYear` is which year of results
 * to display for that roster; omit for the roster season's own year.
 * Omit groupIds (or pass []) for "all training groups this season."
 */
export function useGroupAnalytics(seasonId: string | null, groupIds: string[] = [], dataYear?: number) {
  return useQuery({
    queryKey: ['groupAnalytics', seasonId, groupIds, dataYear],
    queryFn: () => groupService.getGroupAnalytics(seasonId as string, groupIds, dataYear),
    enabled: !!seasonId,
  });
}

/** Meet-by-meet pace trend/spread for one group — the "explore" chart. */
export function useGroupTrend(groupId: string | null, dataYear?: number) {
  return useQuery({
    queryKey: ['groupTrend', groupId, dataYear],
    queryFn: () => groupService.getGroupTrend(groupId as string, dataYear),
    enabled: !!groupId,
  });
}

export function useCreateGroup(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: GroupType; gender?: string | null; sortOrder?: number; color?: string | null }) =>
      groupService.createGroup({ seasonId: seasonId as string, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
    },
  });
}

export function useUpdateGroup(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...input }: { groupId: string; name?: string; sortOrder?: number; color?: string | null; archived?: boolean }) =>
      groupService.updateGroup(groupId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
    },
  });
}

export function useDeleteGroup(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => groupService.deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
    },
  });
}

export function useAssignLeader(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId, primary }: { groupId: string; userId: string; primary?: boolean }) =>
      groupService.assignLeader(groupId, userId, primary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
    },
  });
}

export function useRemoveLeader(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => groupService.removeLeader(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
    },
  });
}

export function useAddMember(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, athleteId }: { groupId: string; athleteId: string }) => groupService.addMember(groupId, athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
      queryClient.invalidateQueries({ queryKey: ['groupMembers'] });
    },
  });
}

export function useRemoveMember(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, athleteId }: { groupId: string; athleteId: string }) => groupService.removeMember(groupId, athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
      queryClient.invalidateQueries({ queryKey: ['groupMembers'] });
    },
  });
}

export function useBulkAssignGroups(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignments: Array<{ athleteId: string; groupId: string }>) => groupService.bulkAssign({ assignments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
      queryClient.invalidateQueries({ queryKey: ['groupMembers'] });
    },
  });
}

export function useCopyGroupsFromSeason(seasonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromSeasonId, toSeasonId }: { fromSeasonId: string; toSeasonId: string }) =>
      groupService.copyFromSeason(fromSeasonId, toSeasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] });
    },
  });
}
