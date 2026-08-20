import { useQuery } from '@tanstack/react-query';
import { athleteService } from '@/api/athleteService';

export interface AthleteRecentRace {
  distance: number; // miles
  time: number; // seconds
  date: string;
}

// Season-agnostic, on purpose: unlike a roster/results query scoped to one
// season, this is "whatever this athlete's most recent race actually was,
// any season" — the same reasoning TrainingPacesCard/MyProgressPage
// already use for seeding pace suggestions from athleteService.getRecentRaces.
// Interval Session's target-pace suggestion needs the same thing, but for a
// whole group of entries at once — a preseason interval session (exactly
// when a coach is most likely to be setting one up) has zero results in
// the *current* season, so a season-scoped source always came back empty.
export function useAthleteRecentRace(athleteIds: string[]) {
  const key = [...new Set(athleteIds)].sort().join(',');
  return useQuery({
    queryKey: ['athleteRecentRace', key],
    queryFn: async () => {
      const entries = await Promise.all(
        [...new Set(athleteIds)].map(async (id): Promise<[string, AthleteRecentRace | null]> => {
          const races = await athleteService.getRecentRaces(id, 1);
          const race = races[0];
          return [id, race ? { distance: race.distance, time: race.time, date: race.date } : null];
        })
      );
      return new Map(entries);
    },
    enabled: athleteIds.length > 0,
  });
}
