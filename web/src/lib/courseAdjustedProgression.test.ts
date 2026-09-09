import { describe, it, expect } from 'vitest';
import {
  buildProgression,
  formatDelta,
  formatCourseEffect,
  MASKING_NOISE_FLOOR_SEC_PER_MILE,
} from './courseAdjustedProgression';

const race = (o: Partial<Parameters<typeof buildProgression>[0][number]> & { raceId: string; date: string }) => ({
  paceSecPerMile: null,
  adjustedPaceSecPerMile: null,
  courseDifficultySecPerMile: null,
  contributingCount: 0,
  ...o,
});

describe('buildProgression', () => {
  it('flags the track-then-hill case: 20 seconds slower raw, faster once the hill is paid for', () => {
    const steps = buildProgression([
      race({ raceId: 'track', date: '2025-09-01', paceSecPerMile: 360, adjustedPaceSecPerMile: 372.5, contributingCount: 6 }),
      race({ raceId: 'hill', date: '2025-09-15', paceSecPerMile: 380, adjustedPaceSecPerMile: 367.5, contributingCount: 6 }),
    ]);

    expect(steps[1].rawDeltaSecPerMile).toBe(20);
    expect(steps[1].adjustedDeltaSecPerMile).toBe(-5);
    expect(steps[1].courseMasked).toBe(true);
  });

  it('orders by date rather than trusting the array, so deltas compare the right pair', () => {
    const steps = buildProgression([
      race({ raceId: 'later', date: '2025-10-01', paceSecPerMile: 400, adjustedPaceSecPerMile: 400 }),
      race({ raceId: 'earlier', date: '2025-09-01', paceSecPerMile: 380, adjustedPaceSecPerMile: 380 }),
    ]);
    expect(steps.map((s) => s.race.raceId)).toEqual(['earlier', 'later']);
    expect(steps[1].rawDeltaSecPerMile).toBe(20);
  });

  it('leaves the first race of a season with nothing to compare against', () => {
    const steps = buildProgression([race({ raceId: 'a', date: '2025-09-01', paceSecPerMile: 380, adjustedPaceSecPerMile: 380 })]);
    expect(steps[0].rawDeltaSecPerMile).toBeNull();
    expect(steps[0].adjustedDeltaSecPerMile).toBeNull();
    expect(steps[0].courseMasked).toBe(false);
  });

  it('does not call a one-second flip a hidden improvement', () => {
    const steps = buildProgression([
      race({ raceId: 'a', date: '2025-09-01', paceSecPerMile: 380, adjustedPaceSecPerMile: 380 }),
      race({ raceId: 'b', date: '2025-09-08', paceSecPerMile: 381, adjustedPaceSecPerMile: 379 }),
    ]);
    expect(steps[1].courseMasked).toBe(false);
  });

  it('keeps an unrated race visible but never compares it as if it were adjusted', () => {
    const steps = buildProgression([
      race({ raceId: 'a', date: '2025-09-01', paceSecPerMile: 380, adjustedPaceSecPerMile: 380, contributingCount: 5 }),
      race({ raceId: 'unrated', date: '2025-09-08', paceSecPerMile: 400, adjustedPaceSecPerMile: null }),
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[1].rawDeltaSecPerMile).toBe(20);
    expect(steps[1].adjustedDeltaSecPerMile).toBeNull();
    expect(steps[1].courseMasked).toBe(false);
  });

  it('agrees with raw when every course ran the same — no flag on an honest regression', () => {
    const steps = buildProgression([
      race({ raceId: 'a', date: '2025-09-01', paceSecPerMile: 380, adjustedPaceSecPerMile: 380 }),
      race({ raceId: 'b', date: '2025-09-08', paceSecPerMile: 395, adjustedPaceSecPerMile: 395 }),
    ]);
    expect(steps[1].courseMasked).toBe(false);
    expect(steps[1].adjustedDeltaSecPerMile).toBe(15);
  });
});

describe('formatDelta', () => {
  it('signs the number so faster and slower are never confused', () => {
    expect(formatDelta(12.4)).toBe('+12 sec/mi');
    expect(formatDelta(-8)).toBe('-8 sec/mi');
  });

  it('says even rather than "+0 sec/mi"', () => {
    expect(formatDelta(0.2)).toBe('even');
  });

  it('shows a dash when there is no previous race', () => {
    expect(formatDelta(null)).toBe('—');
  });
});

describe('formatCourseEffect', () => {
  it('says which way the course cut', () => {
    expect(formatCourseEffect(14, 6)).toBe('14 sec/mi harder than usual');
    expect(formatCourseEffect(-11, 6)).toBe('11 sec/mi easier than usual');
  });

  it('calls a small reading average instead of implying precision it does not have', () => {
    expect(formatCourseEffect(MASKING_NOISE_FLOOR_SEC_PER_MILE - 1, 6)).toBe('About an average course');
  });

  it('distinguishes "no runners to rate it with" from "rated as average"', () => {
    expect(formatCourseEffect(null, 0)).toBe('Course not rated');
    expect(formatCourseEffect(12, 0)).toBe('Course not rated');
  });
});
