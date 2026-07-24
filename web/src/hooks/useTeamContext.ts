import { useQuery } from '@tanstack/react-query';
import api from '@/api/api';

// Everything the client needs to decide what to render *before* it renders
// anything. Without this the app had no way to distinguish "brand new team"
// from "team with no data this season", so first-run coaches were dropped
// into a dozen empty analytics screens.

export interface TeamContextTeam {
  id: string;
  name: string;
  athleticTeamId: string | null;
  currentSeason: number | null;
  joinCode: string | null;
}

export interface TeamContext {
  team: TeamContextTeam | null;
  /** The season every screen should default to. Never a bare calendar year. */
  activeSeason: number;
  calendarSeason: number;
  seasonsWithData: number[];
  totals: { athletes: number; races: number };
  activeSeasonSummary: {
    season: number;
    rosterCount: number;
    raceCount: number;
    /** Roster exists but nobody has raced yet — a real state, not an error. */
    isPreseason: boolean;
  };
  setup: {
    hasAthleticTeamId: boolean;
    hasRoster: boolean;
    hasResults: boolean;
    isComplete: boolean;
  };
}

export function useTeamContext() {
  return useQuery<TeamContext>({
    queryKey: ['teamContext'],
    queryFn: async () => {
      const response = await api.get<TeamContext>('/teams/context');
      return response.data;
    },
    staleTime: 30_000,
  });
}

/**
 * The season the UI should show. Resolves to the server's active season
 * (which accounts for imported data), never `new Date().getFullYear()`.
 */
export function useActiveSeason(): number | undefined {
  const { data } = useTeamContext();
  return data?.activeSeason;
}
