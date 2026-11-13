import { describe, expect, it } from 'vitest';
import { formatMark, formatMeetDate, formatResult } from './trackFormat';

describe('formatMark', () => {
  it('shows total inches as feet and inches', () => {
    expect(formatMark(212.5, 'FEET_INCHES')).toBe(`17' 8.5"`);
    expect(formatMark(385, 'FEET_INCHES')).toBe(`32' 1"`);
    expect(formatMark(452.75, 'FEET_INCHES')).toBe(`37' 8.75"`);
    expect(formatMark(120, 'FEET_INCHES')).toBe(`10' 0"`);
    expect(formatMark(131.999, 'FEET_INCHES')).toBe(`11' 0"`);
  });
  it('shows seconds as a sprint time or m:ss.xx', () => {
    expect(formatMark(13.42, 'SECONDS')).toBe('13.42');
    expect(formatMark(12.8, 'SECONDS')).toBe('12.80');
    expect(formatMark(174.92, 'SECONDS')).toBe('2:54.92');
    expect(formatMark(605.3, 'SECONDS')).toBe('10:05.30');
    expect(formatMark(59.999, 'SECONDS')).toBe('1:00.00');
  });
  it('shows nothing for a missing mark', () => {
    expect(formatMark(null, 'SECONDS')).toBe('');
  });
});

describe('formatResult', () => {
  it('shows the status when there is no mark', () => {
    expect(formatResult({ markValue: null, status: 'DNS' }, 'SECONDS')).toBe('DNS');
    expect(formatResult({ markValue: null, status: 'NM' }, 'FEET_INCHES')).toBe('No mark');
    expect(formatResult({ markValue: 410.5, status: 'FINISHED' }, 'FEET_INCHES')).toBe(`34' 2.5"`);
  });
});

describe('formatMeetDate', () => {
  it('keeps the calendar day regardless of the viewer timezone', () => {
    expect(formatMeetDate('2026-04-30T00:00:00.000Z')).toMatch(/30/);
  });
});
