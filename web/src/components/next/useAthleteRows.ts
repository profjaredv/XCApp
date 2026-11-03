import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useAllGroupMembers, useGroups } from '@/hooks/useGroups';
import { rosterService } from '@/api/rosterService';
import { analyticsService } from '@/api/analyticsService';
import { buildAthleteRows } from '@/lib/athletesList';

// The Athletes list's rows (docs/leadpack-new-ui-trial.md §4.4): the
// season roster with the analytics metrics and group memberships merged
// in by athlete id. Shared by the list and the next athlete page.
export function useAthleteRows(includePast: boolean) {
  const { seasons, activeYear } = useSeasonSelection();
  const season = activeYear ?? undefined;
  const seasonId = seasons.find((s) => s.year === activeYear)?.id ?? null;
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['roster', season, includePast],
    queryFn: () => rosterService.getRoster(season, { activeOnly: !includePast }),
    enabled: season !== undefined,
  });
  const { data: analytics } = useQuery({
    queryKey: ['analyticsOverview', season],
    queryFn: () => analyticsService.getAnalyticsOverview(season as number),
    enabled: season !== undefined,
  });
  const { data: groups = [] } = useGroups(seasonId);
  const groupIds = useMemo(() => groups.filter((g) => !g.archived && g.type !== 'X_TRAINING').map((g) => g.id), [groups]);
  const { data: membersByGroup } = useAllGroupMembers(seasonId, groupIds);
  const rows = useMemo(
    () => buildAthleteRows(roster, analytics?.athletes ?? [], groups, membersByGroup ?? {}),
    [roster, analytics, groups, membersByGroup]
  );
  return { rows, isLoading, season, seasonId, activeYear };
}
