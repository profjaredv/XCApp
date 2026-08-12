import { useMemo, useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPace } from '@/lib/formatUtils';
import { useGroups, useGroupAnalytics } from '@/hooks/useGroups';

const GENDER_LABEL: Record<string, string> = { M: 'Boys', F: 'Girls' };

function pace(seconds: number | null): string {
  return seconds == null ? '—' : formatPace(seconds);
}

interface GroupAnalyticsTabProps {
  /** The season whose Group rows define the roster — always the season being actively managed (usually current), regardless of which year's data is being viewed. */
  groupSeasonId: string | null;
  /** Which year of results to show for that fixed roster. Omit to use the roster season's own year (the live/preseason view, with per-athlete prior-season fallback for anyone who hasn't raced yet). */
  dataYear?: number;
}

// Analytics scoped to a group's roster — filter to one group, or compare
// several at once. Computed live from race results (own endpoint,
// GET /api/groups/analytics), never gated behind "calculate metrics for
// this season first": that gate is exactly what made viewing an athlete's
// profile broken before their 2026 analysis existed, and this view exists
// specifically for preseason, when nothing has been calculated yet.
//
// The roster (who's in each group) always comes from `groupSeasonId` —
// today's group assignments — independent of `dataYear`, which is just
// "what year of results to look at for these people." Picking a past
// year shows that roster's actual results from back then (a coach asking
// "what did my current team do in 2024"); no data for a given athlete in
// that year just shows blank, honestly — no substitution. Only the
// default "no year picked" view (this season, live) falls back per
// athlete to their most recent prior season when they haven't raced yet
// — and even then, that fallback data is always excluded from the
// group's own aggregate, so a strong returner's old numbers can never
// make a group's current pace look better than it actually is yet.
export const GroupAnalyticsTab = ({ groupSeasonId, dataYear }: GroupAnalyticsTabProps) => {
  const { data: allGroups = [] } = useGroups(groupSeasonId);
  const trainingGroups = useMemo(() => allGroups.filter((g) => g.type === 'TRAINING' && !g.archived), [allGroups]);
  const otherGroups = useMemo(() => allGroups.filter((g) => g.type !== 'TRAINING' && !g.archived), [allGroups]);

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  useEffect(() => {
    // Default selection: every training group for this season, the "compare
    // my squads" case. Resets whenever the roster season (and so the group
    // list) changes, rather than carrying a stale selection from a prior
    // season — but NOT when only dataYear changes, so switching which
    // year you're looking at keeps whatever groups you had picked.
    setSelectedIds(trainingGroups.map((g) => g.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSeasonId, trainingGroups.length]);

  const { data: groups = [], isLoading } = useGroupAnalytics(groupSeasonId, selectedIds ?? [], dataYear);

  const toggleGroup = (groupId: string) => {
    setSelectedIds((prev) => {
      const current = prev ?? [];
      return current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId];
    });
  };

  // A season can have real race data with no Season DB row behind it yet
  // (GET /teams/seasons deliberately allows id: null for that — usually an
  // older season imported before Season rows were created for every year).
  // Groups are modeled with a required seasonId FK, so there's genuinely
  // nothing to show here rather than a loading gap — but that must be an
  // explained empty state, not a blank screen a coach can't tell apart
  // from a broken page.
  if (!groupSeasonId) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        This season doesn't have groups set up (it predates group tracking for this team). Group analytics will be available for
        seasons managed from the Groups page.
      </p>
    );
  }

  const allSelectableGroups = [...trainingGroups, ...otherGroups];
  const viewedYear = groups[0]?.dataYear;

  return (
    <div className="space-y-4">
      {allSelectableGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No groups set up for this season yet — create one from the Groups page.</p>
      ) : (
        <>
          {viewedYear !== undefined && (
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{viewedYear}</span> results for your current groups.
            </p>
          )}
          <div className="flex flex-wrap gap-3 rounded-md border p-3">
            {allSelectableGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={(selectedIds ?? []).includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} />
                {g.name}
                {g.gender && <span className="text-xs text-muted-foreground">({GENDER_LABEL[g.gender] ?? g.gender})</span>}
              </label>
            ))}
          </div>
        </>
      )}

      {isLoading && <p className="text-sm text-muted-foreground py-4">Loading…</p>}

      {!isLoading && (selectedIds ?? []).length > 0 && groups.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">No data for the selected group(s).</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{group.name}</CardTitle>
                {group.gender && <Badge variant="secondary">{GENDER_LABEL[group.gender] ?? group.gender}</Badge>}
              </div>
              <CardDescription>
                {group.summary.currentSeasonCount} of {group.summary.athleteCount} athlete{group.summary.athleteCount === 1 ? '' : 's'} with
                {group.summary.currentSeasonCount === group.summary.athleteCount ? '' : ` ${group.dataYear}`} results
                {group.summary.fallbackCount > 0
                  ? ` · ${group.summary.fallbackCount} showing prior-season data`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Group avg pace ({group.dataYear})</p>
                  <p className="font-semibold text-lg">{pace(group.summary.avgPaceSecPerMile)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Group best pace ({group.dataYear})</p>
                  <p className="font-semibold text-lg">{pace(group.summary.bestPaceSecPerMile)}</p>
                </div>
              </div>
              {group.athletes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No athletes in this group.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Best pace</TableHead>
                      <TableHead>Avg pace</TableHead>
                      <TableHead>Races</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.athletes
                      .slice()
                      .sort((a, b) => (a.bestPaceSecPerMile ?? Infinity) - (b.bestPaceSecPerMile ?? Infinity))
                      .map((athlete) => (
                        <TableRow key={athlete.athleteId}>
                          <TableCell className="font-medium">
                            {athlete.name}
                            {athlete.isFallback && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                {athlete.season} data — no races yet this season
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{athlete.grade ?? '—'}</TableCell>
                          <TableCell>{pace(athlete.bestPaceSecPerMile)}</TableCell>
                          <TableCell>{pace(athlete.avgPaceSecPerMile)}</TableCell>
                          <TableCell>{athlete.raceCount}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
