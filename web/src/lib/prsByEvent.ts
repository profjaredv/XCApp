// "One PR per event they've raced" (docs/leadpack-new-ui-trial.md §4.7).
// An event is a distance; races within 1% of each other are the same
// event (a scraper's 4999.9m is a 5K), and nothing is ever converted
// between distances — a 3-mile time is never a "5K PR".

export interface RaceForPr {
  raceId: string;
  meetName: string;
  date: string;
  time: number;
  distanceMeters: number | null;
}

const NAMED: Array<{ meters: number; label: string }> = [
  { meters: 1609, label: '1 Mile' },
  { meters: 2000, label: '2K' },
  { meters: 3200, label: '2 Mile' },
  { meters: 3219, label: '2 Mile' },
  { meters: 4000, label: '4K' },
  { meters: 4828, label: '3 Mile' },
  { meters: 5000, label: '5K' },
  { meters: 6000, label: '6K' },
  { meters: 8000, label: '8K' },
];

export function eventLabel(meters: number): string {
  const named = NAMED.find((n) => Math.abs(n.meters - meters) / n.meters <= 0.01);
  return named ? named.label : `${Math.round(meters)}m`;
}

export interface EventPr<T extends RaceForPr = RaceForPr> {
  label: string;
  distanceMeters: number;
  race: T;
}

export function prsByEvent<T extends RaceForPr>(races: T[]): EventPr<T>[] {
  const events: EventPr<T>[] = [];
  for (const race of races) {
    if (!race.distanceMeters || !(race.time > 0)) continue;
    const label = eventLabel(race.distanceMeters);
    const existing = events.find((e) => e.label === label);
    if (!existing) events.push({ label, distanceMeters: race.distanceMeters, race });
    else if (race.time < existing.race.time) existing.race = race;
  }
  return events.sort((a, b) => a.distanceMeters - b.distanceMeters);
}
