import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workoutTemplateService, type WorkoutTemplateInput } from '../api/workoutTemplateService';

export function useWorkoutTemplates() {
  return useQuery({
    queryKey: ['workoutTemplates'],
    queryFn: workoutTemplateService.list,
  });
}

export function useCreateWorkoutTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkoutTemplateInput) => workoutTemplateService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workoutTemplates'] }),
  });
}

export function useSaveAssignmentAsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, name }: { assignmentId: string; name: string }) =>
      workoutTemplateService.saveFromAssignment(assignmentId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workoutTemplates'] }),
  });
}

export function useUpdateWorkoutTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<WorkoutTemplateInput & { archived: boolean }> }) =>
      workoutTemplateService.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workoutTemplates'] }),
  });
}
