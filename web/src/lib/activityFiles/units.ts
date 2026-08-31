// Unit conversion and the two judgement calls every parser shares.

export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.280839895;

export function metersToMiles(meters: number): number {
  // Two decimals is the resolution a training log displays. Keeping more
  // just means two files describing the same run disagree in the tenth
  // decimal place and look like different rows.
  return Math.round((meters / METERS_PER_MILE) * 100) / 100;
}

export function metersToFeet(meters: number): number {
  return Math.round(meters * FEET_PER_METER);
}

/** The athlete's LOCAL calendar day for an instant, as YYYY-MM-DD.
 *
 *  This runs in the browser deliberately. The server cannot do it — no
 *  team or athlete timezone exists in the schema — and doing it in UTC
 *  would move every run before ~6am local onto the previous day for the
 *  whole of North America. */
export function localDayOf(instant: Date): string {
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Long runs are the one distinction a file can support honestly: it is a
 *  fact about distance, not about intent. Everything else imports as
 *  `easy` and the athlete re-labels what they care about. */
export function inferType(distanceMi: number | null): 'easy' | 'long' | 'other' {
  if (distanceMi === null) return 'other';
  return distanceMi >= 8 ? 'long' : 'easy';
}

const RUN_WORDS = /\b(run|running|jog|treadmill|trail\s*run|track|cross\s*country|xc)\b/i;
const NOT_RUN_WORDS = /\b(ride|cycl|bike|biking|swim|walk|hike|row|elliptical|yoga|weight|strength|ski|surf|golf|soccer)\b/i;

/** Whether a free-text activity label from a file describes a run.
 *
 *  Deliberately conservative in the "no" direction: a mislabelled ride
 *  imported as a run puts 40 phantom miles in a coach's weekly total,
 *  while a run wrongly skipped costs one line the athlete can re-add. So
 *  an explicit non-run word always wins, and an unrecognised label is not
 *  a run. */
export function looksLikeRun(label: string | null | undefined): boolean {
  if (!label) return false;
  if (NOT_RUN_WORDS.test(label)) return false;
  return RUN_WORDS.test(label);
}
