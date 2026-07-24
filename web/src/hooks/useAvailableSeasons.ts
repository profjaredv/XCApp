import { useQuery } from '@tanstack/react-query';
import api from '@/api/api';

export interface Season {
  id: string | null;
  year: number;
  name: string;
  /** Races imported for this season. */
  raceCount: number;
  /** Athletes on this season's roster (can be > 0 while raceCount is 0). */
  rosterCount: number;
  /** Whether any results exist. A season can exist as a roster-only preseason. */
  hasData: boolean;
  isActive: boolean;
}

/**
 * Every season this team knows about, newest first.
 *
 * This previously called `performanceService.getTeamSeasons()` — a method that
 * does not exist on that service. The query therefore always failed, the season
 * picker never populated, and every screen silently fell back to the calendar
 * year (showing an empty season for teams whose data was from a prior year).
 */
export function useAvailableSeasons(teamId?: string) {
  return useQuery<Season[]>({
    queryKey: ['availableSeasons', teamId],
    queryFn: async () => {
      const response = await api.get<Season[]>('/teams/seasons');
      return response.data;
    },
    select: (data) => [...data].sort((a, b) => b.year - a.year),
  });
}
