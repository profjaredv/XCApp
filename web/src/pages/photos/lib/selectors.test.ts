import { describe, it, expect } from 'vitest';
import { filterByGroup } from './selectors';
import type { Athlete } from '../state/types';

function athlete(id: string, groupIds: string[]): Athlete {
  return { id, name: id, photosOptOut: false, groupIds };
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
