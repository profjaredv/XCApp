import { describe, it, expect } from 'vitest';
import { buildAthleteRows, sortAthleteRows } from './athletesList';
import type { RosterAthlete } from '@/api/rosterService';
import type { Group } from '@/api/groupService';

const ath = (id: string, name: string, extra: Partial<RosterAthlete> = {}): RosterAthlete =>
  ({ id, name, grade: 10, graduationYear: 2029, raceCount: 0, graduated: false, onRoster: true, ...extra }) as RosterAthlete;
const grp = (id: string, type: Group['type']): Group =>
  ({ id, name: id, type, gender: null, sortOrder: 0, color: null, archived: false, activeMemberCount: 0, leaders: [] });

describe('Athletes list (§4.4)', () => {
  const roster = [ath('a', 'Ann', { raceCount: 3, isCaptain: true, preferredName: 'Annie' }), ath('b', 'Ben'), ath('c', 'Cal', { raceCount: 1 })];
  const metrics = [
    { id: 'a', bestTime: 1200, prBest5K: 1150, improvementPercent: 2.5, raceCount: 3 },
    { id: 'c', bestTime: 0, prBest5K: 0, improvementPercent: 0, raceCount: 1 },
  ];
  const groups = [grp('cap', 'CAPTAIN'), grp('train', 'TRAINING'), grp('xt', 'X_TRAINING')];
  const members = {
    cap: [{ membershipId: '1', athleteId: 'a', name: 'Ann', gender: null, grade: 10, startDate: '' }],
    train: [{ membershipId: '2', athleteId: 'a', name: 'Ann', gender: null, grade: 10, startDate: '' }],
    xt: [{ membershipId: '3', athleteId: 'b', name: 'Ben', gender: null, grade: 10, startDate: '' }],
  };
  const rows = buildAthleteRows(roster, metrics, groups, members);

  it('every rostered athlete appears, raced or not', () => {
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('joins metrics by id; a 0 is "no 5K", not a time', () => {
    expect(rows[0]).toMatchObject({ name: 'Annie', sb: 1200, pr: 1150, isCaptain: true, trend: 2.5 });
    expect(rows[1]).toMatchObject({ sb: null, pr: null, trend: null });
    expect(rows[2]).toMatchObject({ sb: null, pr: null, trend: null });
  });
  it('lists the training group first and never cross-training', () => {
    expect(rows[0].groups.map((g) => g.id)).toEqual(['train', 'cap']);
    expect(rows[1].groups).toEqual([]);
  });
  it('sorts by SB fastest first, no-5K athletes last', () => {
    expect(sortAthleteRows(rows, 'sb').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(sortAthleteRows(rows, 'name').map((r) => r.name)).toEqual(['Annie', 'Ben', 'Cal']);
  });
});
