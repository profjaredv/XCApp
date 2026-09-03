import { useQuery } from '@tanstack/react-query';
import { strategyService } from '@/api/strategyService';

export function useStrategy(
  athleteId: string | null,
  opts: { targetSec: number; distanceMeters?: number; season?: number }
) {
  return useQuery({
    queryKey: ['strategy', athleteId, opts.targetSec, opts.distanceMeters, opts.season],
    queryFn: () => strategyService.get(athleteId as string, opts),
    enabled: !!athleteId,
  });
}
