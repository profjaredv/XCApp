import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { practicePlanService, type PracticePlanInput } from '../api/practicePlanService';

export function usePracticePlanRange(seasonId: string | null, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['practicePlans', seasonId, from, to],
    queryFn: () => practicePlanService.listRange(seasonId as string, from as string, to as string),
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

function useInvalidatePlans(seasonId: string | null) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['practicePlans', seasonId] });
}

export function useSavePracticePlan(seasonId: string | null) {
  const invalidate = useInvalidatePlans(seasonId);
  return useMutation({
    mutationFn: (input: PracticePlanInput) => practicePlanService.savePlan(input),
    onSuccess: invalidate,
  });
}

export function useSetPublished(seasonId: string | null) {
  const invalidate = useInvalidatePlans(seasonId);
  return useMutation({
    mutationFn: ({ planId, published }: { planId: string; published: boolean }) =>
      practicePlanService.setPublished(planId, published),
    onSuccess: invalidate,
  });
}

export function useDuplicateDay(seasonId: string | null) {
  const invalidate = useInvalidatePlans(seasonId);
  return useMutation({
    mutationFn: ({ planId, toDate, toSeasonId }: { planId: string; toDate: string; toSeasonId?: string }) =>
      practicePlanService.duplicateDay(planId, toDate, toSeasonId),
    onSuccess: invalidate,
  });
}

export function useDuplicateWeek(seasonId: string | null) {
  const invalidate = useInvalidatePlans(seasonId);
  return useMutation({
    mutationFn: practicePlanService.duplicateWeek,
    onSuccess: invalidate,
  });
}
