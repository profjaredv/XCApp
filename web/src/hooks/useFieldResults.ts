import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axios';

export interface FieldResultRace {
  id: string;
  name: string;
  date: string;
  distance: string | null;
  fieldMeanSec: number | null;
  fieldMedianSec: number | null;
  fieldFinisherCount: number | null;
  hasFieldData: boolean;
  normalizationMet: boolean;
}

export const useFieldResultRaces = (season: number | undefined) => {
  return useQuery<FieldResultRace[], Error>({
    queryKey: ['fieldResultRaces', season],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; races: FieldResultRace[] }>('/field-results/races', {
        params: { season },
      });
      return response.data.races;
    },
    enabled: season != null,
  });
};

export interface UploadFieldResultsResponse {
  success: boolean;
  rowsUploaded: number;
  skipped: number;
  errors: { row: number; message: string }[];
  fieldFinisherCount: number;
  normalizationMet: boolean;
  fieldMeanSec: number | null;
  fieldMedianSec: number | null;
}

export const useUploadFieldResults = () => {
  const queryClient = useQueryClient();
  return useMutation<UploadFieldResultsResponse, Error, { raceId: string; csvData: string }>({
    mutationFn: async ({ raceId, csvData }) => {
      const response = await api.post<UploadFieldResultsResponse>(`/field-results/${raceId}`, { csvData });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fieldResultRaces'] });
      queryClient.invalidateQueries({ queryKey: ['bandAnalytics'] });
    },
  });
};

export const useClearFieldResults = () => {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, { raceId: string }>({
    mutationFn: async ({ raceId }) => {
      const response = await api.delete<{ success: boolean }>(`/field-results/${raceId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fieldResultRaces'] });
      queryClient.invalidateQueries({ queryKey: ['bandAnalytics'] });
    },
  });
};
