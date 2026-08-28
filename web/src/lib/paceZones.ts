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

import { formatPace } from './formatUtils';

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


// --- Nerd mode: the arithmetic, shown ---
//
// These traces are built BY the calculation, as a by-product of doing it,
// and every one ends on the value actually returned. That is the whole
// point: a hand-written formula string sitting beside the code could drift
// from it and quietly start lying, which would wreck the trust nerd mode
// exists to build. paceZones.test.ts asserts the last step's value equals
// the returned pace, so a divergence fails the build rather than shipping.

export type ExplainStep = {
  /** What this step works out, in words. */
  label: string;
  /** The rule in symbols. Omitted where the substitution says it all. */
  formula?: string;
  /** The same thing with THIS calculation's real numbers in it. */
  substituted: string;
  /** The step's result, formatted for a human. */
  result: string;
  /** The same result as a raw number, so tests can check the trace is honest. */
  value: number;
};

export type Explanation = {
  title: string;
  steps: ExplainStep[];
  /** Where this lives, for anyone who wants to go read it. */
  source: string;
};

/**
 * m:ss for a whole number of seconds, m:ss.s otherwise.
 *
 * The tenth is not decoration. A trace that rounds its intermediate values
 * to the second does not reproduce when someone checks it by hand — 2:35 ÷
 * 0.497mi comes out 5:12, next to a displayed 5:11 — and a coach who finds
 * that trusts the number LESS than before they looked. Carrying the tenth
 * makes the arithmetic on screen actually work out.
 */
function secs(total: number): string {
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  const whole = Math.floor(abs / 60);
  const rest = abs - whole * 60;
  const isWhole = Math.abs(rest - Math.round(rest)) < 0.05;
  const body = isWhole
    ? String(Math.round(rest)).padStart(2, '0')
    : rest.toFixed(1).padStart(4, '0');
  return `${sign}${whole}:${body}`;
}

function round(n: number, places = 1): string {
  return n.toFixed(places).replace(/\.0+$/, '');
}

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
  /** How this pace was arrived at — rendered by nerd mode. */
  explain: Explanation;
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

/**
 * The same thing, plus the two steps it took to get there.
 *
 * Returns the steps rather than a whole Explanation so a caller can splice
 * them into a longer derivation — an offset zone is "work out the
 * reference pace, THEN add the offset", and both halves should be visible.
 */
function equivalentRacePaceExplained(
  source: SourceRace,
  targetDistanceMeters: number
): { pace: number; steps: ExplainStep[] } | null {
  const sourceMeters = source.distanceMiles * METERS_PER_MILE;
  const time = riegelEquivalentTimeSec(sourceMeters, source.timeSeconds, targetDistanceMeters);
  if (time === null) return null;
  const miles = targetDistanceMeters / METERS_PER_MILE;
  const pace = time / miles;

  const steps: ExplainStep[] = [];
  // Only show the equivalency step when there IS one. Asking for the pace
  // at the distance they actually raced is just division, and dressing it
  // up as a prediction would misrepresent how solid the number is.
  if (Math.round(sourceMeters) !== Math.round(targetDistanceMeters)) {
    steps.push({
      label: `Predict a ${round(targetDistanceMeters)}m time from the ${round(sourceMeters)}m race`,
      formula: 'T₂ = T₁ × (D₂ ÷ D₁) ^ 1.06   (Riegel)',
      substituted: `${secs(source.timeSeconds)} × (${round(targetDistanceMeters)} ÷ ${round(sourceMeters)}) ^ 1.06`,
      result: secs(time),
      value: time,
    });
  }
  steps.push({
    label: steps.length > 0 ? 'Convert that to a pace per mile' : 'Pace per mile from the race itself',
    formula: 'pace = time ÷ (distance ÷ 1609.34)',
    substituted: `${secs(time)} ÷ (${round(targetDistanceMeters)} ÷ 1609.34) = ${secs(time)} ÷ ${round(miles, 3)} mi`,
    result: `${formatPace(pace)}`,
    value: pace,
  });
  return { pace, steps };
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
  const steps: ExplainStep[] = [];

  if (definition.ruleType === 'OFFSET') {
    if (!isNum(definition.refDistanceMeters)) return null;
    if (!isNum(definition.offsetFastSec) || !isNum(definition.offsetSlowSec)) return null;
    const ref = equivalentRacePaceExplained(source, definition.refDistanceMeters);
    if (ref === null) return null;
    steps.push(...ref.steps);
    a = ref.pace + definition.offsetFastSec;
    b = ref.pace + definition.offsetSlowSec;
    const fastOff = definition.offsetFastSec;
    const slowOff = definition.offsetSlowSec;
    steps.push({
      label: fastOff === slowOff ? 'Apply the zone\u2019s offset' : 'Apply the zone\u2019s offset range',
      formula: 'zone = reference pace + offset',
      substituted:
        fastOff === slowOff
          ? `${formatPace(ref.pace)} + ${secs(fastOff)}`
          : `${formatPace(ref.pace)} + ${secs(fastOff)}  \u2026  ${formatPace(ref.pace)} + ${secs(slowOff)}`,
      result: fastOff === slowOff ? formatPace(a) : `${formatPace(a)} \u2013 ${formatPace(b)}`,
      value: Math.min(a, b),
    });
  } else if (definition.ruleType === 'RANGE') {
    if (!isNum(definition.rangeDistanceAMeters) || !isNum(definition.rangeDistanceBMeters)) return null;
    const first = equivalentRacePaceExplained(source, definition.rangeDistanceAMeters);
    const second = equivalentRacePaceExplained(source, definition.rangeDistanceBMeters);
    if (first === null || second === null) return null;
    a = first.pace;
    b = second.pace;
    // A range's two ends are two independent derivations. Collapsing them
    // to one line would hide that the zone's width comes from the gap
    // between two predicted race paces, which is the interesting part.
    // Each end keeps the formula from its own sub-steps: joining the
    // substitutions without it would show the arithmetic but not the rule
    // it came from, which is the half that actually explains anything.
    const joinedFormula = first.steps.map((st) => st.formula).filter(Boolean).join('  then  ');
    steps.push({
      label: `Pace at ${round(definition.rangeDistanceAMeters)}m race effort`,
      formula: joinedFormula || undefined,
      substituted: first.steps.map((st) => st.substituted).join('  →  '),
      result: formatPace(first.pace),
      value: first.pace,
    });
    steps.push({
      label: `Pace at ${round(definition.rangeDistanceBMeters)}m race effort`,
      formula: second.steps.map((st) => st.formula).filter(Boolean).join('  then  ') || undefined,
      substituted: second.steps.map((st) => st.substituted).join('  →  '),
      result: formatPace(second.pace),
      value: second.pace,
    });
    steps.push({
      label: 'The zone is everything between them',
      substituted: `${formatPace(Math.min(a, b))} \u2026 ${formatPace(Math.max(a, b))}`,
      result: `${formatPace(Math.min(a, b))} \u2013 ${formatPace(Math.max(a, b))}`,
      value: Math.min(a, b),
    });
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
    explain: {
      title: `${definition.name} (${definition.abbreviation}), from a ${round(source.distanceMiles * METERS_PER_MILE)}m race in ${secs(source.timeSeconds)}`,
      steps,
      source: 'web/src/lib/paceZones.ts \u00b7 resolvePaceZone()',
    },
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
