// VDOT (Daniels & Gilbert) is a fitness score derived from a single race
// performance: given a distance and time, it estimates the "VO2max-
// equivalent" the athlete raced at, which in turn predicts equivalent times
// at other distances and appropriate training paces. The formulas below are
// the published Daniels-Gilbert equations (public — used across the running
// coaching community, not tied to any specific book's printed tables), not a
// reproduction of Daniels' copyrighted pace tables. Training-pace percentages
// are standard approximations of his named zones (Easy/Marathon/Threshold/
// Interval/Repetition), not exact table lookups, so treat the output as a
// solid coaching estimate rather than a guaranteed match to any published
// chart.

/** VO2 (ml/kg/min) an athlete is running at, given velocity in meters/min. */
function vo2AtVelocity(velocityMetersPerMin: number): number {
  return -4.6 + 0.182258 * velocityMetersPerMin + 0.000104 * velocityMetersPerMin ** 2;
}

/** Inverse of vo2AtVelocity: velocity (m/min) that produces a given VO2. */
function velocityAtVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Fraction of VO2max an athlete can sustain for a given duration (minutes). */
function percentVo2Max(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

/**
 * VDOT from a race performance. distanceMiles/timeSeconds should be an
 * honest recent effort — a jog doesn't produce a meaningful VDOT.
 */
export function computeVDOT(distanceMiles: number, timeSeconds: number): number | null {
  if (!(distanceMiles > 0) || !(timeSeconds > 0)) return null;
  const meters = distanceMiles * 1609.34;
  const minutes = timeSeconds / 60;
  const velocity = meters / minutes; // m/min
  const vo2 = vo2AtVelocity(velocity);
  const vdot = vo2 / percentVo2Max(minutes);
  return Number.isFinite(vdot) && vdot > 0 ? vdot : null;
}

export type TrainingPaceZone = {
  key: 'easy' | 'marathon' | 'threshold' | 'interval' | 'repetition';
  label: string;
  description: string;
  /** Seconds per mile. */
  paceSecPerMile: number;
};

// %VDOT each named zone targets. Easy is a range in Daniels' own writing;
// we use its midpoint here since the UI shows a single pace per zone.
const ZONE_INTENSITY: Record<TrainingPaceZone['key'], number> = {
  easy: 0.66,
  marathon: 0.84,
  threshold: 0.88,
  interval: 0.98,
  repetition: 1.06,
};

const ZONE_META: Record<TrainingPaceZone['key'], { label: string; description: string }> = {
  easy: { label: 'Easy', description: 'Recovery and aerobic-base miles — conversational effort' },
  marathon: { label: 'Marathon', description: 'Steady, sustainable effort for long tempo/marathon-pace work' },
  threshold: { label: 'Threshold', description: "Comfortably-hard \"tempo\" pace, ~20 min race effort" },
  interval: { label: 'Interval', description: 'VO2max intervals, 3-5 min repeats with jog recovery' },
  repetition: { label: 'Repetition', description: 'Short, fast reps for speed and economy, full recovery' },
};

/** Training pace for each named zone, given a VDOT score. */
export function trainingPacesFromVDOT(vdot: number): TrainingPaceZone[] {
  return (Object.keys(ZONE_INTENSITY) as TrainingPaceZone['key'][]).map((key) => {
    const targetVo2 = vdot * ZONE_INTENSITY[key];
    const velocity = velocityAtVo2(targetVo2); // m/min
    const secPerMile = (1609.34 / velocity) * 60;
    return { key, paceSecPerMile: secPerMile, ...ZONE_META[key] };
  });
}

/** Convenience: training paces directly from a race performance. */
export function trainingPacesFromRace(
  distanceMiles: number,
  timeSeconds: number
): { vdot: number; paces: TrainingPaceZone[] } | null {
  const vdot = computeVDOT(distanceMiles, timeSeconds);
  if (vdot === null) return null;
  return { vdot, paces: trainingPacesFromVDOT(vdot) };
}

export type IntervalSplit = {
  key: string;
  label: string;
  meters: number;
  /** Split time, in seconds, at the zone's pace. */
  seconds: number;
};

const SPLIT_DISTANCES: Array<{ key: string; label: string; meters: number }> = [
  { key: '400m', label: '400m', meters: 400 },
  { key: '800m', label: '800m', meters: 800 },
  { key: '1000m', label: '1000m', meters: 1000 },
  { key: '1200m', label: '1200m', meters: 1200 },
  { key: 'mile', label: 'Mile', meters: 1609.34 },
];

/** Split time (seconds) at a given pace (sec/mile) over a specific distance. */
export function splitTimeSec(paceSecPerMile: number, meters: number): number {
  return paceSecPerMile * (meters / 1609.34);
}

// Per-distance splits (the "what should my 800m T-pace be" question) are
// only meaningful for the workout zones an athlete actually runs on a
// track as repeats — Threshold, Interval, Repetition. Easy and Marathon
// pace describe continuous running, not something you'd hit a stopwatch
// split for every 800m, so those return no splits rather than a number
// nobody would use.
export function intervalSplitsForZone(zone: Pick<TrainingPaceZone, 'key' | 'paceSecPerMile'>): IntervalSplit[] {
  if (zone.key === 'easy' || zone.key === 'marathon') return [];
  return SPLIT_DISTANCES.map((d) => ({ ...d, seconds: splitTimeSec(zone.paceSecPerMile, d.meters) }));
}
