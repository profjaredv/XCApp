// Reading an athlete's season metrics, whatever shape they arrive in.
//
// GET /performance/athlete/:id/all-seasons and /season/:year spread the raw
// AthleteSeasonMetrics row, so the live fields are FLAT camelCase
// (totalRaces, totalMiles, averagePace, bestTime5k). Older code read them as
// `metrics.totalRaces` / `metrics.avgMilePace.overall` / `metrics.best.bestTime`,
// which never exist on a live response — so a profile showed 0 races, 0 miles
// and "No 5K yet" for an athlete with a full season. Both pages now read
// through here: flat first, then the legacy shapes as a fallback.

interface LegacyNested {
  totalRaces?: number;
  totalMiles?: number;
  avgMilePace?: { overall?: number };
  best5kTime?: number;
  bestTime?: number;
}

export interface SeasonMetricsLike {
  totalRaces?: number | null;
  total_races?: number | null;
  totalMiles?: number | null;
  total_miles?: number | null;
  averagePace?: number | null;
  average_pace?: number | null;
  best5kTime?: number | null;
  bestTime5k?: number | null;
  best_time_5k?: number | null;
  metrics?: LegacyNested | null;
}

export interface SeasonMetrics {
  totalRaces: number;
  totalMiles: number;
  /** Seconds per mile; 0 when there is none. */
  avgPace: number;
  /** Seconds; 0 when the season has no 5K. */
  best5kTime: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function readSeasonMetrics(s: SeasonMetricsLike | null | undefined): SeasonMetrics {
  if (!s) return { totalRaces: 0, totalMiles: 0, avgPace: 0, best5kTime: 0 };
  const m = s.metrics ?? undefined;
  return {
    totalRaces: num(s.totalRaces ?? s.total_races ?? m?.totalRaces),
    totalMiles: num(s.totalMiles ?? s.total_miles ?? m?.totalMiles),
    avgPace: num(s.averagePace ?? s.average_pace ?? m?.avgMilePace?.overall),
    // The route handler also sets best5kTime from bestTime5k; read both.
    best5kTime: num(s.best5kTime || s.bestTime5k || s.best_time_5k || m?.best5kTime),
  };
}

/** Career totals across seasons. Pace is mileage-weighted; a season with no 5K never erases another season's. */
export function readCareerMetrics(seasons: SeasonMetricsLike[] | null | undefined): SeasonMetrics {
  let races = 0;
  let miles = 0;
  let paceMiles = 0;
  let paceTime = 0;
  let best = Infinity;
  for (const s of seasons ?? []) {
    const m = readSeasonMetrics(s);
    races += m.totalRaces;
    miles += m.totalMiles;
    if (m.totalMiles > 0 && m.avgPace > 0) {
      paceMiles += m.totalMiles;
      paceTime += m.totalMiles * m.avgPace;
    }
    if (m.best5kTime > 0) best = Math.min(best, m.best5kTime);
  }
  return {
    totalRaces: races,
    totalMiles: parseFloat(miles.toFixed(2)),
    avgPace: paceMiles > 0 ? Math.round(paceTime / paceMiles) : 0,
    best5kTime: Number.isFinite(best) ? best : 0,
  };
}
