import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { equipmentService, type EquipmentType, type EquipmentCondition } from '../api/equipmentService';

export function useEquipmentList(type?: EquipmentType) {
  return useQuery({
    queryKey: ['equipment', type ?? 'all'],
    queryFn: () => equipmentService.list(type),
  });
}

function useInvalidateEquipment() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['equipmentOutstanding'] });
  };
}

export function useCreateEquipment() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: equipmentService.create,
    onSuccess: invalidate,
  });
}

export function useUpdateEquipment() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ size: string; condition: EquipmentCondition; retired: boolean; notes: string }> }) =>
      equipmentService.update(id, input),
    onSuccess: invalidate,
  });
}

export function useCheckoutEquipment() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: equipmentService.checkout,
    onSuccess: invalidate,
  });
}

export function useReturnEquipment() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: ({ assignmentId, input }: { assignmentId: string; input: { conditionIn?: EquipmentCondition; notes?: string } }) =>
      equipmentService.returnItem(assignmentId, input),
    onSuccess: invalidate,
  });
}

export function useOutstandingEquipment(seasonId: string | null) {
  return useQuery({
    queryKey: ['equipmentOutstanding', seasonId],
    queryFn: () => equipmentService.outstanding(seasonId as string),
    enabled: !!seasonId,
  });
}
