import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { practicePlanService, type AssignmentInput } from '../api/practicePlanService';

export function useWeekPlans(seasonId: string | null, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['practicePlans', seasonId, from, to],
    queryFn: () => practicePlanService.listWeek(seasonId as string, from as string, to as string),
    enabled: !!seasonId && !!from && !!to,
  });
}

export function useMyPracticePlan(date: string, enabled = true) {
  return useQuery({
    queryKey: ['myPracticePlan', date],
    queryFn: () => practicePlanService.myPlan(date),
    enabled,
  });
}

function useInvalidateWeek(seasonId: string | null) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['practicePlans', seasonId] });
}

export function useSaveDayShell(seasonId: string | null) {
  const invalidate = useInvalidateWeek(seasonId);
  return useMutation({
    mutationFn: practicePlanService.saveDayShell,
    onSuccess: invalidate,
  });
}

export function useSetPublished(seasonId: string | null) {
  const invalidate = useInvalidateWeek(seasonId);
  return useMutation({
    mutationFn: ({ planId, published }: { planId: string; published: boolean }) =>
      practicePlanService.setPublished(planId, published),
    onSuccess: invalidate,
  });
}

export function useAddAssignment(seasonId: string | null) {
  const invalidate = useInvalidateWeek(seasonId);
  return useMutation({
    mutationFn: ({ planId, input }: { planId: string; input: AssignmentInput }) =>
      practicePlanService.addAssignment(planId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateAssignment(seasonId: string | null) {
  const invalidate = useInvalidateWeek(seasonId);
  return useMutation({
    mutationFn: ({ assignmentId, input }: { assignmentId: string; input: Partial<AssignmentInput> }) =>
      practicePlanService.updateAssignment(assignmentId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteAssignment(seasonId: string | null) {
  const invalidate = useInvalidateWeek(seasonId);
  return useMutation({
    mutationFn: (assignmentId: string) => practicePlanService.deleteAssignment(assignmentId),
    onSuccess: invalidate,
  });
}

export function useDuplicateDay(seasonId: string | null) {
  const invalidate = useInvalidateWeek(seasonId);
  return useMutation({
    mutationFn: ({ planId, toDate, toSeasonId }: { planId: string; toDate: string; toSeasonId?: string }) =>
      practicePlanService.duplicateDay(planId, toDate, toSeasonId),
    onSuccess: invalidate,
  });
}

export function useDuplicateWeek(seasonId: string | null) {
  const invalidate = useInvalidateWeek(seasonId);
  return useMutation({
    mutationFn: practicePlanService.duplicateWeek,
    onSuccess: invalidate,
  });
}
