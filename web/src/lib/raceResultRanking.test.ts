import { describe, it, expect } from 'vitest';
import { isRankableFinish, compareByFinishTime } from '@/lib/raceResultRanking';

// The bug: "entries with 0:00 were showing up as top runners" after a
// metrics recalculation. A DNS/DNF/DQ row can carry a leftover nonzero
// time from before it was marked a non-finish (backend lib/raceResults.js's
// decideResultWrite) — checking `time` alone, even `time != null`, isn't
// enough anywhere results get ranked or sorted by time.

describe('isRankableFinish', () => {
  it('is true for a genuine finish', () => {
    expect(isRankableFinish({ status: 'FINISHED', time: 1000 })).toBe(true);
  });

  it('is false for a non-finish, even with a stale nonzero time', () => {
    expect(isRankableFinish({ status: 'DNS', time: 1 })).toBe(false);
    expect(isRankableFinish({ status: 'DNF', time: 500 })).toBe(false);
    expect(isRankableFinish({ status: 'DQ', time: 900 })).toBe(false);
  });

  it('is false for a null or zero time even when status says FINISHED', () => {
    expect(isRankableFinish({ status: 'FINISHED', time: null })).toBe(false);
    expect(isRankableFinish({ status: 'FINISHED', time: 0 })).toBe(false);
  });

  it('is false when status is missing entirely', () => {
    expect(isRankableFinish({ time: 1000 })).toBe(false);
  });
});

describe('compareByFinishTime', () => {
  it('sorts real finishers fastest to slowest', () => {
    const rows = [
      { name: 'Slow', status: 'FINISHED', time: 1200 },
      { name: 'Fast', status: 'FINISHED', time: 1000 },
    ];
    expect([...rows].sort(compareByFinishTime).map((r) => r.name)).toEqual(['Fast', 'Slow']);
  });

  it('a DNS with a stale nonzero time never outranks a real finisher, however slow', () => {
    const rows = [
      { name: 'Stale DNS', status: 'DNS', time: 1 },
      { name: 'Slow Finisher', status: 'FINISHED', time: 2000 },
    ];
    expect([...rows].sort(compareByFinishTime).map((r) => r.name)).toEqual(['Slow Finisher', 'Stale DNS']);
  });

  it('a null-time non-finish never outranks a real finisher either', () => {
    const rows = [
      { name: 'DNF', status: 'DNF', time: null },
      { name: 'Finisher', status: 'FINISHED', time: 2000 },
    ];
    expect([...rows].sort(compareByFinishTime).map((r) => r.name)).toEqual(['Finisher', 'DNF']);
  });
});
