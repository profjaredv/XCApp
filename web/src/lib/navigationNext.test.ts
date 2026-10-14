import { describe, it, expect } from 'vitest';
import { nextNavFor, mobileTabsFor, moreItemsFor, nextNavRole, NEXT_NAV } from './navigationNext';
import { scopeOptions, resolveScope, defaultScope } from '@/contexts/GroupScopeContext';
import { scopeAppliesTo } from './groupScopeRoutes';
import type { Group } from '@/api/groupService';
import type { User } from '@/types';

// docs/leadpack-new-ui-trial.md §3.6 — the table, row by row.
const labels = (xs: { label: string }[]) => xs.map((x) => x.label);

describe('next nav per role', () => {
  it('head coach / coach: desktop zones and Setup', () => {
    expect(labels(nextNavFor('coach', 'week'))).toEqual(['Today', 'Train', 'Groups']);
    expect(labels(nextNavFor('coach', 'insights'))).toEqual(['Athletes', 'Meets', 'Season', 'Program']);
    expect(labels(nextNavFor('coach', 'setup'))).toEqual(['Roster', 'Data & Import', 'Equipment', 'Field Results', 'Photos', 'Settings', 'Coaching staff']);
  });
  it('coach phone: Today, Train, Groups, Meets + More (Athletes, Season, Program, Setup)', () => {
    expect(labels(mobileTabsFor('coach'))).toEqual(['Today', 'Train', 'Groups', 'Meets']);
    expect(labels(moreItemsFor('coach'))).toEqual(['Athletes', 'Season', 'Program', 'Roster', 'Data & Import', 'Equipment', 'Field Results', 'Photos', 'Settings', 'Coaching staff']);
  });
  it('volunteer coach: same, minus Setup', () => {
    expect(labels(nextNavFor('volunteer', 'week'))).toEqual(['Today', 'Train', 'Groups']);
    expect(nextNavFor('volunteer', 'setup')).toEqual([]);
    expect(labels(mobileTabsFor('volunteer'))).toEqual(['Today', 'Train', 'Groups', 'Meets']);
  });
  it('athlete: Today, My Season, Train, Meets, Photos; phone puts Meets in More', () => {
    expect(labels([...nextNavFor('athlete', 'week'), ...nextNavFor('athlete', 'insights')])).toEqual(['Today', 'My Season', 'Train', 'Meets', 'Photos']);
    expect(labels(mobileTabsFor('athlete'))).toEqual(['Today', 'My Season', 'Train', 'Photos']);
    expect(labels(moreItemsFor('athlete'))).toEqual(['Meets']);
  });
  it('parent: Today, My Runner, Meets, Photos; phone puts Meets in More', () => {
    expect(labels([...nextNavFor('parent', 'week'), ...nextNavFor('parent', 'insights')])).toEqual(['Today', 'My Runner', 'Meets', 'Photos']);
    expect(labels(mobileTabsFor('parent'))).toEqual(['Today', 'My Runner', 'Photos']);
    expect(labels(moreItemsFor('parent'))).toEqual(['Meets']);
  });
  it('a team feature switched off disappears, as in classic', () => {
    expect(labels(nextNavFor('coach', 'setup', { equipment: false }))).not.toContain('Equipment');
    expect(labels(mobileTabsFor('athlete', { photos: false }))).toEqual(['Today', 'My Season', 'Train']);
  });
  it('uses the UI words from §5 — no Schedule, Analytics or Band Trends', () => {
    for (const e of NEXT_NAV) expect(['Schedule', 'Analytics', 'Band Trends', 'Practice Plans']).not.toContain(e.label);
  });
  it('role comes from TeamMember role, then a linked athlete', () => {
    expect(nextNavRole({ teamRole: 'HEAD_COACH' } as User)).toBe('coach');
    expect(nextNavRole({ teamRole: 'VOLUNTEER_COACH' } as User)).toBe('volunteer');
    expect(nextNavRole({ teamRole: 'ATHLETE', linkedAthlete: { id: 'a' } } as unknown as User)).toBe('athlete');
    expect(nextNavRole({ teamRole: null } as User, { isGuardian: true })).toBe('parent');
  });
});

const g = (id: string, type: Group['type'], leaders: string[] = [], sortOrder = 0): Group => ({
  id, name: id, type, gender: null, sortOrder, color: null, archived: false, activeMemberCount: 3,
  leaders: leaders.map((userId) => ({ userId, name: userId, email: '', primary: true })),
});

describe('group scope', () => {
  const groups = [g('custom', 'CUSTOM'), g('xt', 'X_TRAINING'), g('cap', 'CAPTAIN'), g('t2', 'TRAINING', ['u1'], 2), g('t1', 'TRAINING', [], 1)];
  it('orders Training, Captain, Other and never offers cross-training', () => {
    expect(scopeOptions(groups).map((x) => x.id)).toEqual(['t1', 't2', 'cap', 'custom']);
  });
  it('a coach leading exactly one group defaults to it, otherwise All', () => {
    const opts = scopeOptions(groups);
    expect(defaultScope(opts, 'u1', false)).toBe('t2');
    expect(defaultScope(opts, 'nobody', false)).toBe('all');
  });
  it('a volunteer only sees the groups they lead and can never pick All', () => {
    const opts = scopeOptions(groups, { volunteerUserId: 'u1' });
    expect(opts.map((x) => x.id)).toEqual(['t2']);
    expect(resolveScope('all', opts, 'u1', true)).toBe('t2');
    expect(resolveScope('t1', opts, 'u1', true)).toBe('t2');
  });
  it('a stored scope that no longer exists falls back to the default', () => {
    expect(resolveScope('gone', scopeOptions(groups), 'nobody', false)).toBe('all');
    expect(resolveScope('cap', scopeOptions(groups), 'nobody', false)).toBe('cap');
  });
  it('the chip shows only on pages that respect it', () => {
    expect(scopeAppliesTo('today', '')).toBe(true);
    expect(scopeAppliesTo('athletes', '')).toBe(true);
    expect(scopeAppliesTo('season', '?tab=byGroup')).toBe(true);
    expect(scopeAppliesTo('season', '?tab=dashboard')).toBe(false);
    expect(scopeAppliesTo('meet/m1', '?tab=results')).toBe(true);
    expect(scopeAppliesTo('meet/m1', '?tab=preview')).toBe(false);
    expect(scopeAppliesTo('meets', '')).toBe(false);
  });
});
