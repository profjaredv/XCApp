import { describe, it, expect } from 'vitest';
import { eligibleForCollage, filterByGroup } from './selectors';
import type { Athlete, AthletePicks } from '../state/types';

function athlete(id: string, groupIds: string[], photosOptOut = false): Athlete {
  return { id, name: id, photosOptOut, groupIds };
}

describe('filterByGroup', () => {
  it('returns every athlete, unfiltered, when groupId is null', () => {
    const athletes = [athlete('a', ['g1']), athlete('b', [])];
    expect(filterByGroup(athletes, null)).toEqual(athletes);
  });

  it('keeps only athletes whose groupIds include the given group', () => {
    const inGroup = athlete('a', ['g1', 'g2']);
    const otherGroup = athlete('b', ['g2']);
    const noGroup = athlete('c', []);
    expect(filterByGroup([inGroup, otherGroup, noGroup], 'g1')).toEqual([inGroup]);
  });
});

describe('eligibleForCollage', () => {
  it('requires at least 3 picks', () => {
    const picks: AthletePicks = { a: ['p1', 'p2'], b: ['p1', 'p2', 'p3'] };
    const athletes = [athlete('a', []), athlete('b', [])];
    expect(eligibleForCollage(athletes, picks).map((a) => a.id)).toEqual(['b']);
  });

  it('skips an opted-out athlete even with 3+ picks', () => {
    const picks: AthletePicks = { a: ['p1', 'p2', 'p3'] };
    const athletes = [athlete('a', [], true)];
    expect(eligibleForCollage(athletes, picks)).toEqual([]);
  });

  it('treats a missing picks entry as zero picks, not a crash', () => {
    const athletes = [athlete('a', [])];
    expect(eligibleForCollage(athletes, {})).toEqual([]);
  });
});
