import { useQuery } from '@tanstack/react-query';
import { axiosInstance as api } from '@/api/axios';
import type { GridAthlete, GridColumn } from '@/lib/meetTrend';

// Every athlete's time in every race column for a season (GET /teams/results-grid).
// Shared by Meets → Analysis and the athlete inspector so one fetch feeds both.
export type ResultsGrid = { races: GridColumn[]; athletes: Array<GridAthlete & { name: string }> };

export const useResultsGrid = (season: number | undefined) =>
  useQuery({
    queryKey: ['resultsGrid', season],
    queryFn: async () => (await api.get<ResultsGrid>(`/teams/results-grid?seasons=${season}`)).data,
    enabled: season != null,
  });
