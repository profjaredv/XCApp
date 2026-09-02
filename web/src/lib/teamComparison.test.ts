import { describe, it, expect } from 'vitest';
import { pickPeerGroup, paceGap, MIN_PEER_GROUP } from './teamComparison';

const team = {
  totalAthletes: 24,
  avgMilePace: { overall: 450 },
  byGender: {
    men: { count: 14, avgPace: 400, totalRaces: 70 },
    women: { count: 10, avgPace: 480, totalRaces: 40 },
  },
  byGradeGender: {
    grade9: { M: { count: 5, avgPace: 430, totalRaces: 20 }, F: { count: 1, avgPace: 500, totalRaces: 4 } },
    grade12: { M: { count: 2, avgPace: 380, totalRaces: 10 }, F: { count: 4, avgPace: 455, totalRaces: 16 } },
  },
};

describe('pickPeerGroup', () => {
  it('prefers same grade and gender when that group is big enough', () => {
    const peer = pickPeerGroup(team, 'M', 9);
    expect(peer).toMatchObject({ count: 5, avgPace: 430 });
    expect(peer?.label).toBe('the freshman boys');
  });

  it('falls back to the whole gender when the grade group is one person', () => {
    // grade9 F has exactly one athlete — that average IS her.
    const peer = pickPeerGroup(team, 'F', 9);
    expect(peer).toMatchObject({ count: 10, avgPace: 480, label: 'the girls' });
  });

  it('falls back when the grade group is under the floor but not empty', () => {
    expect(MIN_PEER_GROUP).toBe(3);
    const peer = pickPeerGroup(team, 'M', 12); // 2 seniors
    expect(peer).toMatchObject({ count: 14, label: 'the boys' });
  });

  it('never mixes boys and girls when a gender is known', () => {
    expect(pickPeerGroup(team, 'M', 11)?.label).toBe('the boys');
    expect(pickPeerGroup(team, 'F', 11)?.label).toBe('the girls');
  });

  it('uses the whole team only when the athlete has no gender on file', () => {
    expect(pickPeerGroup(team, null, 10)).toMatchObject({ count: 24, avgPace: 450, label: 'the team' });
  });

  it('reports races per athlete, not the group total', () => {
    expect(pickPeerGroup(team, 'M', 9)?.avgRaces).toBe(4);
  });

  it('gives nothing to compare against on a team too small to average', () => {
    expect(pickPeerGroup({ totalAthletes: 2, avgMilePace: { overall: 460 } }, null, null)).toBeNull();
    expect(pickPeerGroup(null, 'M', 9)).toBeNull();
  });

  it('ignores a group whose pace never got computed', () => {
    expect(
      pickPeerGroup({ byGender: { men: { count: 9, avgPace: 0 } }, totalAthletes: 0, avgMilePace: { overall: 0 } }, 'M', null)
    ).toBeNull();
  });

  it('has no races per athlete when the bucket did not carry a race count', () => {
    expect(pickPeerGroup({ byGender: { men: { count: 9, avgPace: 400 } } }, 'M', null)?.avgRaces).toBeNull();
  });
});

describe('paceGap', () => {
  it('calls the lower pace the faster one', () => {
    expect(paceGap(390, 430)).toEqual({ seconds: 40, faster: true });
    expect(paceGap(470, 430)).toEqual({ seconds: 40, faster: false });
  });

  it('is null when either side is missing', () => {
    expect(paceGap(0, 430)).toBeNull();
    expect(paceGap(430, 0)).toBeNull();
    expect(paceGap(NaN, 430)).toBeNull();
  });
});
