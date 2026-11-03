import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useOptionalSeasonSelection } from './SeasonContext';
import { useGroups, useAllGroupMembers } from '@/hooks/useGroups';
import {
  GroupScopeContext,
  resolveScope,
  scopeOptions,
  scopeStorageKey,
  type GroupScopeValue,
} from './GroupScopeContext';

// Mounted by the "next" shell (components/next/AppShell.tsx) only — classic
// has no group scope. Persists per user, team and season in localStorage
// (docs/leadpack-new-ui-trial.md §3.3). Split from GroupScopeContext.ts for
// fast refresh, like the other providers.
export const GroupScopeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const seasonSelection = useOptionalSeasonSelection();
  const teamRole = currentUser?.teamRole;
  const isVolunteer = teamRole === 'VOLUNTEER_COACH';
  const enabledRole = isVolunteer || teamRole === 'HEAD_COACH' || teamRole === 'COACH';

  const year = seasonSelection?.activeYear ?? null;
  const seasonId = seasonSelection?.seasons.find((s) => s.year === year)?.id ?? null;
  const userId = currentUser?.uid ?? null;
  const teamId = currentUser?.team?.id ?? null;

  const { data: groups = [], isLoading: groupsLoading } = useGroups(enabledRole ? seasonId : null);
  const options = useMemo(
    () => scopeOptions(groups, { volunteerUserId: isVolunteer ? userId : null }),
    [groups, isVolunteer, userId]
  );

  const storageKey = userId && teamId && year ? scopeStorageKey(userId, teamId, year) : null;
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    if (!storageKey) return;
    try {
      setStored(window.localStorage.getItem(storageKey));
    } catch {
      setStored(null);
    }
  }, [storageKey]);

  const scope = resolveScope(stored, options, userId, isVolunteer);

  const setScope = useCallback(
    (value: GroupScopeValue) => {
      setStored(value);
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        // Storage blocked: the choice lasts this session only.
      }
    },
    [storageKey]
  );

  const scopedGroups = useMemo(() => {
    if (scope === 'all' || scope === 'mine') return options;
    return options.filter((g) => g.id === scope);
  }, [scope, options]);

  // Members are only fetched when something is actually filtered.
  const filtering = enabledRole && (scope !== 'all');
  const memberGroupIds = filtering ? scopedGroups.map((g) => g.id) : [];
  const { data: membersByGroup, isLoading: membersLoading } = useAllGroupMembers(seasonId, memberGroupIds);

  const athleteIdsInScope = useMemo(() => {
    if (!filtering) return null;
    const ids = new Set<string>();
    for (const members of Object.values(membersByGroup ?? {})) for (const m of members) ids.add(m.athleteId);
    return ids;
  }, [filtering, membersByGroup]);

  const label =
    scope === 'all' ? 'All athletes' : scope === 'mine' ? 'My groups' : scopedGroups[0]?.name ?? 'All athletes';

  const value = useMemo(
    () => ({
      enabled: enabledRole && !!seasonId,
      options,
      scope,
      setScope,
      scopedGroups,
      athleteIdsInScope,
      label,
      seasonId,
      isVolunteer,
      isLoading: groupsLoading || (filtering && membersLoading),
    }),
    [enabledRole, seasonId, options, scope, setScope, scopedGroups, athleteIdsInScope, label, isVolunteer, groupsLoading, filtering, membersLoading]
  );

  return <GroupScopeContext.Provider value={value}>{children}</GroupScopeContext.Provider>;
};
