import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paceZoneService, type PaceZoneInput } from '@/api/paceZoneService';

const KEY = ['paceZones'];

// A team's custom zones. Read by everyone on the team (an athlete needs to
// know what their coach's "T" means), written only by a head coach.
export function usePaceZones() {
  return useQuery({ queryKey: KEY, queryFn: paceZoneService.list });
}

export function useSavePaceZones() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (zones: PaceZoneInput[]) => paceZoneService.save(zones),
    onSuccess: (zones) => {
      // Seed the cache from the response rather than refetching: the PUT
      // already returns the saved set, and every training-pace card on
      // screen should update from the same write.
      qc.setQueryData(KEY, zones);
    },
  });
}
