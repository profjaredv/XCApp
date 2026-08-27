// Training paces from a coach's OWN vocabulary.
//
// The existing vdotPaces.ts answers a different question: Daniels' VDOT
// model derives paces from a percentage of an estimated VO2max, and its
// zones are Daniels' five. That is still what the VDOT Calculator and
// interval sessions use, and it is left alone.
//
// This file answers the question coaches actually ask on a whiteboard,
// which is always phrased against RACE performances:
//
//   "Distance = 2-3 minutes slower than best 1 mile time"
//   "VO2 = 2 mile to 5k race pace"
//
// Both shapes need one primitive — "what would this athlete run for a race
// at distance X" — and then simple arithmetic on top. That primitive is
// Riegel's equation, which is also the model McMillan-style calculators are
// built on, and it is why a team's custom zones and the shipped defaults
// can be expressed in exactly the same vocabulary: MCMILLAN_ZONES below is
// nothing more than a set of definitions a coach could have typed.
//
// ON THE DEFAULTS AND McMILLAN: Greg McMillan's published pace tables are
// his own work and are not reproduced here. What is implemented is the
// zone STRUCTURE and the race-pace relationships he describes in prose —
// V-O2max work at 3K-5K race pace, speed work at 800m-1600m race pace, and
// so on — computed by the Riegel engine below. Treat the output as a solid
// coaching estimate in the McMillan tradition, not as his calculator.

const METERS_PER_MILE = 1609.34;

// Riegel's exponent. 1.06 is the value from his original 1977 paper and the
// one in near-universal use; it is what makes a longer race predict a
// slower pace rather than the same one.
//
// KNOWN LIMIT, worth understanding before trusting a number from this:
// Riegel compresses at short distances. From an 18:00 5K it predicts 5:11/mi
// for 800m against 5:25/mi for the mile — only 14 seconds apart, where a
// real 5:25 miler races 800m nearer 4:50/mi. So zones anchored on 800m-1600m
// race pace (the default Speed zone, and EHS's R) come out CONSERVATIVE —
// slightly too slow — and the error grows the shorter the anchor. It is
// stable and predictable rather than erratic, which is why a single
// well-understood model is still better here than blending two, but a coach
// setting rep targets off the Speed zone should expect to tighten them.
const RIEGEL_EXPONENT = 1.06;

/** A race an athlete actually ran, used as the source of every estimate. */
export type SourceRace = {
  /** Miles. Matches what athleteService.getRecentRaces already returns. */
  distanceMiles: number;
  timeSeconds: number;
};

/** One zone as stored for a team, or as shipped in the default set. */
export type PaceZoneDefinition = {
  id: string;
  abbreviation: string;
  name: string;
  notes: string | null;
  ruleType: 'OFFSET' | 'RANGE';
  refDistanceMeters: number | null;
  offsetFastSec: number | null;
  offsetSlowSec: number | null;
  rangeDistanceAMeters: number | null;
  rangeDistanceBMeters: number | null;
};

export type ResolvedPace = {
  fastSecPerMile: number;
  slowSecPerMile: number;
  /** True when the two ends are the same pace, so the UI shows one number. */
  isSinglePace: boolean;
};

export type ResolvedPaceZone = {
  definition: PaceZoneDefinition;
  /** null when the definition is incomplete or the race is unusable. */
  paces: ResolvedPace | null;
};

/**
 * Riegel: T2 = T1 * (D2 / D1) ^ 1.06. Distances in meters, times in seconds.
 *
 * Returns null rather than NaN/Infinity for unusable input. Every caller
 * here treats null as "we can't say", which is the honest answer and is
 * what stops a zero distance from turning into a pace of 0:00/mi that
 * looks like a real target.
 */
export function riegelEquivalentTimeSec(
  fromDistanceMeters: number,
  fromTimeSeconds: number,
  toDistanceMeters: number
): number | null {
  if (!(fromDistanceMeters > 0) || !(fromTimeSeconds > 0) || !(toDistanceMeters > 0)) return null;
  const result = fromTimeSeconds * Math.pow(toDistanceMeters / fromDistanceMeters, RIEGEL_EXPONENT);
  return Number.isFinite(result) ? result : null;
}

/**
 * What this athlete would average, per mile, racing `targetDistanceMeters`.
 * Asking for the source race's own distance returns its own pace.
 */
export function equivalentRacePaceSecPerMile(
  source: SourceRace,
  targetDistanceMeters: number
): number | null {
  const sourceMeters = source.distanceMiles * METERS_PER_MILE;
  const time = riegelEquivalentTimeSec(sourceMeters, source.timeSeconds, targetDistanceMeters);
  if (time === null) return null;
  return time / (targetDistanceMeters / METERS_PER_MILE);
}

// Floating point makes "the same offset twice" not quite equal after the
// division above, so single-pace detection needs a tolerance rather than
// ===. A tenth of a second per mile is far below anything displayable.
const SINGLE_PACE_TOLERANCE_SEC = 0.1;

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * A definition plus an athlete's race, as an actual pace range.
 *
 * Always returns fast (quicker, smaller) first regardless of how the
 * definition was written: a coach entering "5k to 2 mile" means the same
 * zone as "2 mile to 5k", and every caller downstream can then rely on the
 * ordering instead of re-deriving it.
 */
export function resolvePaceZone(
  definition: PaceZoneDefinition,
  source: SourceRace
): ResolvedPace | null {
  let a: number | null = null;
  let b: number | null = null;

  if (definition.ruleType === 'OFFSET') {
    if (!isNum(definition.refDistanceMeters)) return null;
    if (!isNum(definition.offsetFastSec) || !isNum(definition.offsetSlowSec)) return null;
    const refPace = equivalentRacePaceSecPerMile(source, definition.refDistanceMeters);
    if (refPace === null) return null;
    a = refPace + definition.offsetFastSec;
    b = refPace + definition.offsetSlowSec;
  } else if (definition.ruleType === 'RANGE') {
    if (!isNum(definition.rangeDistanceAMeters) || !isNum(definition.rangeDistanceBMeters)) return null;
    a = equivalentRacePaceSecPerMile(source, definition.rangeDistanceAMeters);
    b = equivalentRacePaceSecPerMile(source, definition.rangeDistanceBMeters);
  } else {
    return null;
  }

  if (a === null || b === null) return null;
  // A pace at or below zero is not a slower-than-usual answer, it is a
  // broken one — an offset big enough to cancel the reference pace out.
  if (!(a > 0) || !(b > 0)) return null;

  const fast = Math.min(a, b);
  const slow = Math.max(a, b);
  return {
    fastSecPerMile: fast,
    slowSecPerMile: slow,
    isSinglePace: slow - fast < SINGLE_PACE_TOLERANCE_SEC,
  };
}

/**
 * Resolve a whole set, keeping zones that could NOT be resolved. A broken
 * definition has to stay visible — silently dropping it means a coach sees
 * four zones where they defined five and has no idea which one is wrong.
 */
export function resolvePaceZones(
  definitions: PaceZoneDefinition[],
  source: SourceRace
): ResolvedPaceZone[] {
  return definitions.map((definition) => ({ definition, paces: resolvePaceZone(definition, source) }));
}

function offsetZone(
  id: string,
  abbreviation: string,
  name: string,
  refDistanceMeters: number,
  offsetFastSec: number,
  offsetSlowSec: number,
  notes: string
): PaceZoneDefinition {
  return {
    id, abbreviation, name, notes,
    ruleType: 'OFFSET',
    refDistanceMeters, offsetFastSec, offsetSlowSec,
    rangeDistanceAMeters: null, rangeDistanceBMeters: null,
  };
}

function rangeZone(
  id: string,
  abbreviation: string,
  name: string,
  rangeDistanceAMeters: number,
  rangeDistanceBMeters: number,
  notes: string
): PaceZoneDefinition {
  return {
    id, abbreviation, name, notes,
    ruleType: 'RANGE',
    rangeDistanceAMeters, rangeDistanceBMeters,
    refDistanceMeters: null, offsetFastSec: null, offsetSlowSec: null,
  };
}

const MILE_METERS = 1609;
const FIVE_K_METERS = 5000;

/**
 * The default set every team gets, McMillan-style: his zone structure and
 * the race-pace relationships he describes, expressed in the same rule
 * vocabulary a coach can type. Ordered fastest to slowest.
 *
 * The endurance zones are anchored to 5K pace rather than mile pace because
 * this is a cross-country app — a 5K is the race nearly every athlete here
 * has actually run, so the anchor is the least-extrapolated number
 * available. The speed zones are stated as race-pace ranges because that is
 * how McMillan states them.
 */
export const MCMILLAN_ZONES: PaceZoneDefinition[] = [
  rangeZone('mcm-speed', 'SP', 'Speed', 800, MILE_METERS,
    '800m to mile race pace. Short, fast reps with full recovery — economy and turnover, not fitness.'),
  rangeZone('mcm-vo2', 'VO2', 'VO2 Max', 3000, FIVE_K_METERS,
    '3K to 5K race pace. The classic interval zone: 2-5 minute reps with jog recovery.'),
  offsetZone('mcm-tempo', 'T', 'Tempo', FIVE_K_METERS, 20, 40,
    'About 20-40 seconds per mile slower than 5K pace — "comfortably hard", roughly one-hour race effort.'),
  offsetZone('mcm-ss', 'SS', 'Steady State', FIVE_K_METERS, 45, 75,
    'Faster than an easy run, slower than tempo. Sustained aerobic work that stays conversational-ish.'),
  offsetZone('mcm-easy', 'E', 'Easy', FIVE_K_METERS, 90, 150,
    'The bulk of the week. Conversational — if you cannot talk, it is too fast.'),
  offsetZone('mcm-recovery', 'REC', 'Recovery', FIVE_K_METERS, 165, 240,
    'Day-after-hard-work jogging. Deliberately slow; the point is blood flow, not fitness.'),
];

/** True for a default zone, which a team cannot edit or delete. */
export function isDefaultZone(zone: PaceZoneDefinition): boolean {
  return zone.id.startsWith('mcm-');
}
