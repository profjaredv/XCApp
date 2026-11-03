// Time trial vs race pace: the early-season 1 mile time trial is the one
// all-out effort every athlete runs under the same conditions. If an
// athlete's average pace over a 2 mile / 3 mile / 5K race has closed in on
// (or passed) their time trial pace, they are fundamentally fitter than when
// they started; a faster retest says the same from the other end.
//
// A time trial is a race that is 1 mile or 1600m AND has "time trial" in its
// name (a 1 mile invitational heat is not one). Computed from the Results
// Grid payload (GET /teams/results-grid), the same data as Meets → Analysis.
// Pace is seconds per mile, so lower is faster.

import type { GridAthlete, GridColumn } from './meetTrend';

const METERS_PER_MILE = 1609.344;
const MILE_TOLERANCE_M = 20; // 1600m and 1 mile both qualify; 1500m does not
/** "2 mile, 3 mile or 5K": 3200m and up (a 1.5 mile race is not a distance race). */
export const MIN_RACE_METERS = 3150;

const NAME_RE = /\btime[\s-]*trials?\b|\btt\b/i;

export function isTimeTrial(name: string, distanceMeters: number | null | undefined): boolean {
  if (!distanceMeters || !NAME_RE.test(name)) return false;
  return Math.abs(distanceMeters - METERS_PER_MILE) <= MILE_TOLERANCE_M || Math.abs(distanceMeters - 1600) <= MILE_TOLERANCE_M;
}

export interface TimeTrialRace {
  name: string;
  date: string;
  distanceMeters: number;
  pace: number;
  /** Race pace minus the baseline mile pace; positive = slower than the mile. */
  vsMile: number;
}

export interface TimeTrialRow {
  athleteId: string;
  name: string;
  gender: string;
  /** The earliest time trial: where the athlete started. */
  tt: { name: string; date: string; pace: number };
  /** A later time trial, if the team ran one again. */
  retest: { name: string; date: string; pace: number } | null;
  /** Races of 2 mile and up after the time trial, in date order. */
  races: TimeTrialRace[];
  avgRacePace: number;
  /** Average race pace minus the mile pace; smaller = endurance closer to speed. */
  gap: number;
  /** The first distance race's gap minus the latest's; positive = closing in. null with one race. */
  narrowed: number | null;
  /** Their latest distance race was at or faster than their time trial mile pace. */
  matched: boolean;
}

export interface TimeTrialSummary {
  athletes: number;
  medianGap: number | null;
  /** Median of `narrowed` over athletes with two or more distance races. */
  medianNarrowed: number | null;
  matched: number;
  retests: number;
  fasterRetests: number;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function buildTimeTrialFitness(
  columns: GridColumn[],
  athletes: Array<GridAthlete & { name?: string }>,
  inScope?: Set<string> | null
): { rows: TimeTrialRow[]; summary: TimeTrialSummary; hasTimeTrial: boolean } {
  const dated = columns.map((c, i) => ({ c, i })).filter(({ c }) => !!c.date && (c.distanceMeters ?? 0) > 0);
  const ttCols = dated.filter(({ c }) => isTimeTrial(c.name, c.distanceMeters)).sort((a, b) => a.c.date!.localeCompare(b.c.date!));
  const raceCols = dated
    .filter(({ c }) => (c.distanceMeters as number) >= MIN_RACE_METERS && !isTimeTrial(c.name, c.distanceMeters))
    .sort((a, b) => a.c.date!.localeCompare(b.c.date!));

  const rows: TimeTrialRow[] = [];
  for (const a of athletes) {
    if (inScope && !inScope.has(a.athleteId)) continue;
    const trials = ttCols
      .filter(({ i }) => (a.results[i] ?? 0) > 0)
      .map(({ c, i }) => ({ name: c.name, date: c.date as string, pace: ((a.results[i] as number) / (c.distanceMeters as number)) * METERS_PER_MILE }));
    if (trials.length === 0) continue;
    const base = trials[0];
    const races: TimeTrialRace[] = raceCols
      .filter(({ c, i }) => (c.date as string) > base.date && (a.results[i] ?? 0) > 0)
      .map(({ c, i }) => {
        const pace = ((a.results[i] as number) / (c.distanceMeters as number)) * METERS_PER_MILE;
        return { name: c.name, date: c.date as string, distanceMeters: c.distanceMeters as number, pace, vsMile: pace - base.pace };
      });
    if (races.length === 0) continue;
    const avgRacePace = races.reduce((s, r) => s + r.pace, 0) / races.length;
    const last = races[races.length - 1];
    rows.push({
      athleteId: a.athleteId,
      name: a.name ?? '',
      gender: a.gender,
      tt: { name: base.name, date: base.date, pace: base.pace },
      retest: trials.length > 1 ? trials[trials.length - 1] : null,
      races,
      avgRacePace,
      gap: avgRacePace - base.pace,
      narrowed: races.length > 1 ? races[0].vsMile - last.vsMile : null,
      matched: last.pace <= base.pace,
    });
  }

  const retests = rows.filter((r) => r.retest);
  return {
    rows,
    hasTimeTrial: ttCols.length > 0,
    summary: {
      athletes: rows.length,
      medianGap: median(rows.map((r) => r.gap)),
      medianNarrowed: median(rows.flatMap((r) => (r.narrowed == null ? [] : [r.narrowed]))),
      matched: rows.filter((r) => r.matched).length,
      retests: retests.length,
      fasterRetests: retests.filter((r) => (r.retest as { pace: number }).pace < r.tt.pace).length,
    },
  };
}
