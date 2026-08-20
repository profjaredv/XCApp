import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axios';

export interface FieldResultRace {
  id: string;
  name: string;
  date: string;
  distance: string | null;
  // Groups races into "one meet, multiple divisions" — see the backend
  // comment in routes/fieldResults.js for the fallback chain (meetId, then
  // athleticMeetId, then the race's own id as a singleton group).
  meetId: string;
  // The athletic.net results/all page for this race's meet, when known.
  resultsAllUrl: string | null;
  fieldMeanSec: number | null;
  fieldMedianSec: number | null;
  fieldFinisherCount: number | null;
  hasFieldData: boolean;
  normalizationMet: boolean;
  // Another XCApp team already uploaded this same meet+race's field — see
  // findSharedFieldSource in routes/fieldResults.js. Only set when this
  // race has no field data of its own yet.
  availableFromOtherTeam: boolean;
  otherTeamFieldFinisherCount: number | null;
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
      queryClient.invalidateQueries({ queryKey: ['programAnalytics'] });
    },
  });
};

export interface CopyFieldResultsResponse {
  success: boolean;
  fieldFinisherCount: number;
  normalizationMet: boolean;
  fieldMeanSec: number | null;
  fieldMedianSec: number | null;
}

export const useCopyFieldResultsFromMeet = () => {
  const queryClient = useQueryClient();
  return useMutation<CopyFieldResultsResponse, Error, { raceId: string }>({
    mutationFn: async ({ raceId }) => {
      const response = await api.post<CopyFieldResultsResponse>(`/field-results/${raceId}/copy-from-meet`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fieldResultRaces'] });
      queryClient.invalidateQueries({ queryKey: ['bandAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['programAnalytics'] });
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
      queryClient.invalidateQueries({ queryKey: ['programAnalytics'] });
    },
  });
};
