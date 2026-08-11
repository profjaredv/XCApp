import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupService, type GroupType } from '../api/groupService';

export function useGroups(seasonId: string | null) {
  return useQuery({
    queryKey: ['groups', seasonId],
    queryFn: () => groupService.listGroups(seasonId as string),
    enabled: !!seasonId,
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
