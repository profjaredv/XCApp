import { describe, it, expect } from 'vitest';
import { bestFiveK, formatFiveK, isFiveK, NO_5K } from './fiveK';

describe('F5: 5K labels', () => {
  it('shows "No 5K yet" instead of a zero under a 5K label', () => {
    expect(formatFiveK(0)).toBe(NO_5K);
    expect(formatFiveK(null)).toBe(NO_5K);
    expect(formatFiveK(undefined)).toBe(NO_5K);
    expect(formatFiveK(1080)).toBe('18:00.0');
  });

  it('treats only an actual 5K as a 5K — not a 3-mile or a 6K', () => {
    expect(isFiveK(3.1)).toBe(true);
    expect(isFiveK(3.107)).toBe(true);
    expect(isFiveK(3.0)).toBe(false);
    expect(isFiveK(2.75)).toBe(false);
    expect(isFiveK(3.73)).toBe(false);
    expect(isFiveK(null)).toBe(false);
  });
});

describe('bestFiveK', () => {
  it('ignores a faster 3-mile race that the old 2.75–3.5mi "5K" bucket would have headlined', () => {
    const races = [
      { name: '3 Mile Inv', distanceMi: 3.0, time: 1000 },
      { name: 'Real 5K', distanceMi: 3.107, time: 1100 },
    ];
    expect(bestFiveK(races)?.name).toBe('Real 5K');
  });
  it('is null when nothing is a 5K', () => {
    expect(bestFiveK([{ distanceMi: 2, time: 700 }])).toBeNull();
  });
});
