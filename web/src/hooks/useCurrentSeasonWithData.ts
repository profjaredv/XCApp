import { useCurrentSeason } from './useCurrentSeason';
import { useAvailableSeasons } from './useAvailableSeasons';

/**
 * Like useCurrentSeason(), but for screens with no season picker of their
 * own: if the team's active season is a fresh preseason with no races yet,
 * landing there shows "no data" with no way to see the team's real history.
 * Falls back to the most recent season that actually has data instead.
 *
 * Screens that DO have their own season picker (AnalyticsPage, the athlete
 * profile page) implement this same fallback themselves, scoped to what
 * they're picking a default for (team-wide vs. one athlete) — this hook is
 * for the simpler screens that just need one sensible default season.
 */
export function useCurrentSeasonWithData(teamId?: string): number {
  const activeSeason = useCurrentSeason();
  const { data: availableSeasons } = useAvailableSeasons(teamId);

  if (!availableSeasons || availableSeasons.length === 0) return activeSeason;

  const activeHasData = availableSeasons.find((s) => s.year === activeSeason)?.hasData;
  if (activeHasData) return activeSeason;

  return availableSeasons.find((s) => s.hasData)?.year ?? activeSeason;
}
