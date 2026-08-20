import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { practiceLocationService } from '../api/practiceLocationService';

export function usePracticeLocations() {
  return useQuery({
    queryKey: ['practiceLocations'],
    queryFn: practiceLocationService.list,
  });
}

export function useCreatePracticeLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => practiceLocationService.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['practiceLocations'] }),
  });
}

export function useUpdatePracticeLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; archived?: boolean } }) =>
      practiceLocationService.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['practiceLocations'] }),
  });
}
