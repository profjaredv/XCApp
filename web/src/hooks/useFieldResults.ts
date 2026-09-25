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
  // How many of this team's own results (out of ourResultCount) the
  // upload actually matched to a field finisher, by athlete name — 0 for
  // both when the race has no field data uploaded yet, so a coach who
  // uploaded a CSV in a name format that doesn't match the roster (e.g.
  // "Last, First" from a different export source) can immediately tell
  // matching failed instead of assuming the upload silently did nothing.
  // A mismatch here means fieldMeanSec/fieldFinisherCount are fine but
  // this team's own scoring, standing, and Program-tab numbers see none
  // of it.
  ourResultCount: number;
  ourMatchedCount: number;
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
