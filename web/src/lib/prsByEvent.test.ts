import { describe, it, expect } from 'vitest';
import { eventLabel, prsByEvent } from './prsByEvent';

describe('PR per event (§4.7)', () => {
  const r = (raceId: string, distanceMeters: number | null, time: number) => ({ raceId, meetName: raceId, date: '2026-09-01', time, distanceMeters });
  it('labels common XC distances and falls back to metres', () => {
    expect(eventLabel(5000)).toBe('5K');
    expect(eventLabel(4999.9)).toBe('5K');
    expect(eventLabel(3218.7)).toBe('2 Mile');
    expect(eventLabel(4828)).toBe('3 Mile');
    expect(eventLabel(4200)).toBe('4200m');
  });
  it('keeps the fastest time per event and never merges distances', () => {
    const prs = prsByEvent([r('a', 5000, 1100), r('b', 5000.2, 1050), r('c', 4828, 990), r('d', null, 500), r('e', 3200, 700)]);
    expect(prs.map((p) => [p.label, p.race.raceId])).toEqual([['2 Mile', 'e'], ['3 Mile', 'c'], ['5K', 'b']]);
  });
});
