// Reading a course-adjusted race list race-by-race.
//
// The whole point of the adjustment is that raw and adjusted can DISAGREE
// about whether a runner got better: 6:00 on a track then 6:20 on a hill
// is 20 seconds slower raw and several seconds faster once the hill is
// paid for. Spotting that disagreement is the feature, so it's computed
// here rather than left to the eye.

export interface AdjustedRaceRow {
  raceId: string;
  date: string;
  paceSecPerMile: number | null;
  adjustedPaceSecPerMile: number | null;
  courseDifficultySecPerMile: number | null;
  contributingCount: number;
}

export interface ProgressionStep<T> {
  race: T;
  /** Change in raw pace from the previous race. Negative = faster. Null for the first race. */
  rawDeltaSecPerMile: number | null;
  /** Change in course-adjusted pace. Negative = a real improvement. */
  adjustedDeltaSecPerMile: number | null;
  /**
   * True when raw and adjusted point opposite ways — the case a coach
   * would otherwise misread. Only set when both deltas exist and neither
   * is inside the noise floor.
   */
  courseMasked: boolean;
}

// Under ~3 sec/mile is inside the run-to-run noise of a cross country
// course — the same floor RaceComparisonTab uses before calling a course
// harder or easier at all. Calling a 1-second flip a "hidden improvement"
// would make the flag worthless.
export const MASKING_NOISE_FLOOR_SEC_PER_MILE = 3;

/**
 * Walks a season's races in date order, pairing each against the one
 * before it. Races without an adjusted pace still appear — they just
 * can't contribute a comparison, and saying so is better than dropping
 * them or comparing them on raw pace as if they were adjusted.
 */
export function buildProgression<T extends AdjustedRaceRow>(races: T[]): Array<ProgressionStep<T>> {
  const ordered = [...races].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return ordered.map((race, i) => {
    const prev = i > 0 ? ordered[i - 1] : null;

    const rawDeltaSecPerMile =
      prev && race.paceSecPerMile != null && prev.paceSecPerMile != null
        ? race.paceSecPerMile - prev.paceSecPerMile
        : null;

    const adjustedDeltaSecPerMile =
      prev && race.adjustedPaceSecPerMile != null && prev.adjustedPaceSecPerMile != null
        ? race.adjustedPaceSecPerMile - prev.adjustedPaceSecPerMile
        : null;

    const courseMasked =
      rawDeltaSecPerMile != null &&
      adjustedDeltaSecPerMile != null &&
      Math.sign(rawDeltaSecPerMile) !== Math.sign(adjustedDeltaSecPerMile) &&
      Math.abs(rawDeltaSecPerMile) >= MASKING_NOISE_FLOOR_SEC_PER_MILE &&
      Math.abs(adjustedDeltaSecPerMile) >= MASKING_NOISE_FLOOR_SEC_PER_MILE;

    return { race, rawDeltaSecPerMile, adjustedDeltaSecPerMile, courseMasked };
  });
}

/** "+12 sec/mi" / "-8 sec/mi", or a dash when there is nothing to compare. */
export function formatDelta(secPerMile: number | null): string {
  if (secPerMile == null) return '—';
  const rounded = Math.round(secPerMile);
  if (rounded === 0) return 'even';
  return `${rounded > 0 ? '+' : ''}${rounded} sec/mi`;
}

/** How much harder this course ran than the season's average. */
export function formatCourseEffect(secPerMile: number | null, contributingCount: number): string {
  if (secPerMile == null || contributingCount === 0) return 'Course not rated';
  const rounded = Math.round(secPerMile);
  if (Math.abs(rounded) < MASKING_NOISE_FLOOR_SEC_PER_MILE) return 'About an average course';
  return rounded > 0 ? `${rounded} sec/mi harder than usual` : `${Math.abs(rounded)} sec/mi easier than usual`;
}
