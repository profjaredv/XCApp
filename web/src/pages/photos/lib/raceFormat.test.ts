import { describe, it, expect } from 'vitest';
import { formatRaceTime, formatPace, formatRaceDate, formatRaceDistance, formatMiles } from './raceFormat';

describe('formatRaceTime', () => {
  it('formats under an hour as M:SS', () => {
    expect(formatRaceTime(1052)).toBe('17:32');
    expect(formatRaceTime(65)).toBe('1:05');
  });

  it('formats an hour or more clock-style, not minutes over 59', () => {
    expect(formatRaceTime(3725)).toBe('1:02:05');
  });

  it('rounds to the nearest whole second', () => {
    expect(formatRaceTime(65.6)).toBe('1:06');
  });
});

describe('formatPace', () => {
  it('appends /mi to a formatted time', () => {
    expect(formatPace(444)).toBe('7:24/mi');
  });
});

describe('formatRaceDate', () => {
  it('formats a date as a short month and day', () => {
    expect(formatRaceDate('2026-09-05T00:00:00.000Z')).toBe('Sep 5');
  });

  it('returns an empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatRaceDate('not-a-date')).toBe('');
  });
});

describe('formatRaceDistance', () => {
  it('formats exactly 5000m as "5K"', () => {
    expect(formatRaceDistance('5K', 5000)).toBe('5K');
  });

  it('formats a whole-mile distance as "n mi"', () => {
    expect(formatRaceDistance(null, 1609.344)).toBe('1 mi');
    expect(formatRaceDistance(null, 3 * 1609.344)).toBe('3 mi');
  });

  it('formats a half-mile distance as "n.5 mi"', () => {
    expect(formatRaceDistance(null, 1.5 * 1609.344)).toBe('1.5 mi');
  });

  it('formats a distance that is not a round (half-)mile or 5K in meters', () => {
    expect(formatRaceDistance(null, 4200)).toBe('4200m');
  });

  it('falls back to the label when meters is missing', () => {
    expect(formatRaceDistance('5K', null)).toBe('5K');
  });

  it('returns an empty string with neither a label nor meters', () => {
    expect(formatRaceDistance(null, null)).toBe('');
  });
});

describe('formatMiles', () => {
  it('keeps one decimal place for a fractional total', () => {
    expect(formatMiles(142.3)).toBe('142.3 mi');
  });

  it('drops the decimal for a whole number', () => {
    expect(formatMiles(12)).toBe('12 mi');
  });
});
