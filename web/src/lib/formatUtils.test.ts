import { describe, it, expect } from 'vitest';
import { formatDuration } from './formatUtils';

describe('formatDuration', () => {
  it('rolls over into hours instead of counting to 90 minutes', () => {
    // formatTime (race times) renders this as "90:00.0", which is right
    // for a 5k split and wrong for a long run.
    expect(formatDuration(5400)).toBe('1:30:00');
    expect(formatDuration(2892)).toBe('48:12');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('shows an em dash rather than a zero for missing time', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});
