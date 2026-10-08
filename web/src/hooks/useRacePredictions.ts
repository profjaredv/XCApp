import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axios';

export interface PredictedSplit {
  sequence: number;
  markerMeters: number;
  label: string;
  predictedElapsedSec: number;
}

export interface RacePrediction {
  id: string;
  meetId: string;
  // Null until the real race exists (this team's races only materialize
  // once results are scraped, after the meet) — see distanceEstimated.
  raceId: string | null;
  raceName: string;
  raceDate: string;
  distanceMeters: number;
  // True when no race existed yet and distanceMeters is a stand-in (this
  // athlete's own most recent race distance), not the race's own real one.
  distanceEstimated: boolean;
  predictedTimeSec: number;
  predictedPaceSecPerMile: number;
  trendPaceSecPerMile: number;
  courseDifficultySecPerMile: number | null;
  basedOnRaceCount: number;
  biasAppliedSecPerMile: number | null;
  marginSecPerMile: number | null;
  predictedSplits: PredictedSplit[] | null;
  actualTimeSec: number | null;
  actualPaceSecPerMile: number | null;
  errorSecPerMile: number | null;
  scoredAt: string | null;
  createdAt: string;
}

export type NoPredictionReason = 'no-upcoming-race' | 'not-on-roster' | 'insufficient-history';

export interface NextRacePredictionResponse {
  success: boolean;
  prediction: RacePrediction | null;
  reason?: NoPredictionReason;
  race?: { id: string; name: string; date: string };
}

export const useNextRacePrediction = (athleteId: string | undefined) => {
  return useQuery<NextRacePredictionResponse, Error>({
    queryKey: ['racePrediction', 'next', athleteId],
    queryFn: async () => {
      const response = await api.get<NextRacePredictionResponse>(`/race-predictions/athlete/${athleteId}/next`);
      return response.data;
    },
    enabled: !!athleteId,
  });
};

export const useRecomputeRacePrediction = (athleteId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation<NextRacePredictionResponse, Error, { meetId?: string } | undefined>({
    mutationFn: async (body) => {
      const response = await api.post<NextRacePredictionResponse>(
        `/race-predictions/athlete/${athleteId}/recompute`,
        body ?? {}
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['racePrediction', 'next', athleteId] });
      queryClient.invalidateQueries({ queryKey: ['racePredictions', 'meet'] });
    },
  });
};

export interface MeetPredictionEntry {
  athleteId: string;
  athleteName: string;
  raceId: string | null;
  raceName: string;
  prediction: RacePrediction | null;
  reason: NoPredictionReason | null;
}

export const useMeetRacePredictions = (meetId: string | undefined) => {
  return useQuery<MeetPredictionEntry[], Error>({
    queryKey: ['racePredictions', 'meet', meetId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; predictions: MeetPredictionEntry[] }>(
        `/race-predictions/meet/${meetId}`
      );
      return response.data.predictions;
    },
    enabled: !!meetId,
  });
};
