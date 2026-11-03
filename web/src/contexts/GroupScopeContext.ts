import { createContext, useContext } from 'react';
import type { Group } from '@/api/groupService';

// The group scope (docs/leadpack-new-ui-trial.md §3.3): in the "next"
// shell, a coach's chosen group applies across pages the way the season
// does. Filtering is client-side, from the memberships the groups API
// already returns — no server query changes.

/** 'all' = no filter; 'mine' = a volunteer's own groups; otherwise a group id. */
export type GroupScopeValue = string;

export interface GroupScopeContextValue {
  /** False for athletes, parents, and outside a team — no chip, no filter. */
  enabled: boolean;
  /** Pickable groups, already restricted for volunteers. No cross-training group. */
  options: Group[];
  scope: GroupScopeValue;
  setScope: (value: GroupScopeValue) => void;
  /** The groups the current scope covers (all options for 'all'). */
  scopedGroups: Group[];
  /** Athletes in scope, or null when nothing is filtered (scope = all, for a full coach). */
  athleteIdsInScope: Set<string> | null;
  /** Short label for the chip. */
  label: string;
  seasonId: string | null;
  isVolunteer: boolean;
  isLoading: boolean;
}

export const GroupScopeContext = createContext<GroupScopeContextValue>({
  enabled: false,
  options: [],
  scope: 'all',
  setScope: () => {},
  scopedGroups: [],
  athleteIdsInScope: null,
  label: 'All athletes',
  seasonId: null,
  isVolunteer: false,
  isLoading: false,
});

export function useGroupScope(): GroupScopeContextValue {
  return useContext(GroupScopeContext);
}

const TYPE_ORDER: Record<string, number> = { TRAINING: 0, CAPTAIN: 1, CUSTOM: 2 };

/** Picker order: Training groups, then Captain groups, then Other. Never X_TRAINING. */
export function scopeOptions(groups: Group[], opts: { volunteerUserId?: string | null } = {}): Group[] {
  return groups
    .filter((g) => !g.archived && g.type !== 'X_TRAINING')
    .filter((g) => !opts.volunteerUserId || g.leaders.some((l) => l.userId === opts.volunteerUserId))
    .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * The scope to use when nothing valid is stored: a coach who leads exactly
 * one group gets that group, everyone else gets All. A volunteer is never
 * given All — their own groups ('mine'), or their only group.
 */
export function defaultScope(options: Group[], userId: string | null | undefined, isVolunteer: boolean): GroupScopeValue {
  const led = options.filter((g) => g.leaders.some((l) => l.userId === userId));
  if (led.length === 1) return led[0].id;
  return isVolunteer ? 'mine' : 'all';
}

/** A stored value is only honored if it still names something this person can pick. */
export function resolveScope(
  stored: string | null,
  options: Group[],
  userId: string | null | undefined,
  isVolunteer: boolean
): GroupScopeValue {
  if (stored === 'all' && !isVolunteer) return 'all';
  if (stored === 'mine' && isVolunteer) return 'mine';
  if (stored && options.some((g) => g.id === stored)) return stored;
  return defaultScope(options, userId, isVolunteer);
}

export function scopeStorageKey(userId: string, teamId: string, seasonYear: number): string {
  return `xc_group_scope:${userId}:${teamId}:${seasonYear}`;
}
