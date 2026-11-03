// Made-up numbers for the marketing page's example charts. None of this is a
// real team or athlete; the page says so next to every chart.

export interface SeasonPoint { meet: string; pace: number }
export interface GrowthPoint { season: string; grade: string; best5k: number }
export interface PackPoint { place: string; gap: number; scorer: boolean }

/** A team's average pace (seconds per mile) at each meet of one season. */
export const SEASON: SeasonPoint[] = [
  { meet: 'Sep 2', pace: 408 },
  { meet: 'Sep 9', pace: 401 },
  { meet: 'Sep 16', pace: 404 },
  { meet: 'Sep 23', pace: 393 },
  { meet: 'Sep 30', pace: 389 },
  { meet: 'Oct 7', pace: 384 },
  { meet: 'Oct 14', pace: 378 },
  { meet: 'Oct 21', pace: 372 },
];

/** One athlete's best 5K (seconds) in each of four seasons. */
export const GROWTH: GrowthPoint[] = [
  { season: '2023', grade: '9th', best5k: 1368 },
  { season: '2024', grade: '10th', best5k: 1295 },
  { season: '2025', grade: '11th', best5k: 1214 },
  { season: '2026', grade: '12th', best5k: 1161 },
];

/** Seconds behind the team's first finisher, top seven at one meet. Five score; two displace. */
export const PACK: PackPoint[] = [
  { place: '1', gap: 0, scorer: true },
  { place: '2', gap: 16, scorer: true },
  { place: '3', gap: 27, scorer: true },
  { place: '4', gap: 39, scorer: true },
  { place: '5', gap: 48, scorer: true },
  { place: '6', gap: 70, scorer: false },
  { place: '7', gap: 93, scorer: false },
];

export function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
