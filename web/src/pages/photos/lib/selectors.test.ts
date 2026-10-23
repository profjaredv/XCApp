import { describe, it, expect } from 'vitest';
import { athletesById, eligibleForCollage, filterByGroup, visiblePhotos } from './selectors';
import type { Actor } from './tagRules';
import type { Athlete, AthletePicks, Photo, PhotoAthleteTags } from '../state/types';

function athlete(id: string, groupIds: string[], photosOptOut = false): Athlete {
  return { id, name: id, photosOptOut, groupIds };
}

function photo(id: string): Photo {
  return { id, meetId: 'm1', takenAt: '2026-09-01T00:00:00Z', width: 100, height: 100, status: 'ready', thumbUrl: '', webUrl: '' };
}

const COACH: Actor = { userId: 'coach-1', isCoach: true, role: 'coach', linkedAthleteIds: [], ledGroupIds: [] };

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

describe('visiblePhotos: groupFilter', () => {
  const athleteInGroup = athlete('a', ['g1']);
  const athleteOutOfGroup = athlete('b', ['g2']);
  const byId = athletesById([athleteInGroup, athleteOutOfGroup]);

  function baseArgs() {
    return {
      photos: [photo('p-tagged-in'), photo('p-tagged-out'), photo('p-untagged')],
      tags: {
        'p-tagged-in': [{ athleteId: 'a', source: 'coach' as const, taggedBy: 'coach-1' }],
        'p-tagged-out': [{ athleteId: 'b', source: 'coach' as const, taggedBy: 'coach-1' }],
      } as PhotoAthleteTags,
      athletesByIdMap: byId,
      actor: COACH,
      meetFilter: null,
      tagFilter: 'all' as const,
      armedAthleteId: null,
      timeWindow: null,
    };
  }

  it('keeps photos tagged with a group member, and untagged photos (still claimable)', () => {
    const result = visiblePhotos({ ...baseArgs(), groupFilter: 'g1' });
    expect(result.map((p) => p.id).sort()).toEqual(['p-tagged-in', 'p-untagged']);
  });

  it('is a no-op when groupFilter is null', () => {
    const result = visiblePhotos({ ...baseArgs(), groupFilter: null });
    expect(result.map((p) => p.id).sort()).toEqual(['p-tagged-in', 'p-tagged-out', 'p-untagged']);
  });
});

describe('visiblePhotos: athleteFilter', () => {
  const a = athlete('a', []);
  const b = athlete('b', []);
  const byId = athletesById([a, b]);

  function baseArgs() {
    return {
      photos: [photo('p-a'), photo('p-b'), photo('p-untagged')],
      tags: {
        'p-a': [{ athleteId: 'a', source: 'coach' as const, taggedBy: 'coach-1' }],
        'p-b': [{ athleteId: 'b', source: 'coach' as const, taggedBy: 'coach-1' }],
      } as PhotoAthleteTags,
      athletesByIdMap: byId,
      actor: COACH,
      meetFilter: null,
      tagFilter: 'all' as const,
      armedAthleteId: null,
      timeWindow: null,
    };
  }

  it('keeps only photos tagged with that exact athlete — untagged photos are excluded, unlike groupFilter', () => {
    const result = visiblePhotos({ ...baseArgs(), athleteFilter: 'a' });
    expect(result.map((p) => p.id)).toEqual(['p-a']);
  });

  it('is a no-op when athleteFilter is null', () => {
    const result = visiblePhotos({ ...baseArgs(), athleteFilter: null });
    expect(result.map((p) => p.id).sort()).toEqual(['p-a', 'p-b', 'p-untagged']);
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
