import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { splitsService } from '@/api/splitsService';
import type { BatchSplitEntry, RaceSplitsView } from '@/types/splits';

export function useRaceSplits(raceId: string | null) {
  return useQuery({
    queryKey: ['splits', 'race', raceId],
    queryFn: () => splitsService.getRaceSplits(raceId as string),
    enabled: !!raceId,
  });
}

export function useAthleteSplits(athleteId: string | null) {
  return useQuery({
    queryKey: ['splits', 'athlete', athleteId],
    queryFn: () => splitsService.getAthleteSplits(athleteId as string),
    enabled: !!athleteId,
  });
}

// C10: per-distance-bucket pacing averages — used by both the athlete's
// own "My splits" card and the coach-facing athlete profile, so both read
// the exact same numbers (routes/splits.js's /aggregate route).
export function useAthleteSplitsAggregate(athleteId: string | null) {
  return useQuery({
    queryKey: ['splits', 'athlete', athleteId, 'aggregate'],
    queryFn: () => splitsService.getAthleteSplitsAggregate(athleteId as string),
    enabled: !!athleteId,
  });
}

// C6: patches just the edited rows into the cached race view from the save
// response instead of invalidating/refetching the whole grid — a refetch on
// every 800ms-debounced autosave would be disruptive, and computing
// segments/analysis client-side would duplicate lib/splitMath.js, which C4
// forbids. POST /batch returns each saved row's computed segments/analysis
// precisely so this patch can happen locally.
export function useSaveSplitsBatch(raceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entries: BatchSplitEntry[]) => splitsService.saveSplitsBatch(raceId as string, entries),
    onSuccess: (data) => {
      queryClient.setQueryData<RaceSplitsView | undefined>(['splits', 'race', raceId], (prev) => {
        if (!prev) return prev;
        const bySequence = new Map(prev.markers.map((m) => [m.sequence, m.label]));
        const patchByResultId = new Map(data.results.map((r) => [r.resultId, r]));
        return {
          ...prev,
          results: prev.results.map((row) => {
            const patch = patchByResultId.get(row.resultId);
            if (!patch) return row;
            return {
              ...row,
              splits: patch.splits.map((s) => ({
                id: row.splits.find((existing) => existing.sequence === s.sequence)?.id ?? `${row.resultId}-${s.sequence}`,
                sequence: s.sequence,
                elapsedSec: s.elapsedSec,
                label: bySequence.get(s.sequence) ?? `Marker ${s.sequence}`,
              })),
              segments: patch.segments,
              analysis: patch.analysis,
              overallPaceSecPerMile: patch.overallPaceSecPerMile,
            };
          }),
        };
      });
    },
  });
}
