import { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LineChart as LineChartIcon } from 'lucide-react';
import { formatPace, formatDateShort } from '@/lib/formatUtils';
import { useGroups, useGroupAnalytics, useGroupTrend } from '@/hooks/useGroups';
import { GroupPicker } from './GroupPicker';

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
  const [exploreGroup, setExploreGroup] = useState<{ id: string; name: string } | null>(null);

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
          <GroupPicker
            trainingGroups={trainingGroups}
            otherGroups={otherGroups}
            selectedIds={selectedIds ?? []}
            onChange={setSelectedIds}
          />
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
                <div className="flex items-center gap-2">
                  {group.gender && <Badge variant="secondary">{GENDER_LABEL[group.gender] ?? group.gender}</Badge>}
                  <Button variant="outline" size="sm" onClick={() => setExploreGroup({ id: group.id, name: group.name })}>
                    <LineChartIcon className="h-3.5 w-3.5 mr-1.5" />
                    Explore
                  </Button>
                </div>
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

      <GroupTrendDialog group={exploreGroup} dataYear={dataYear} onClose={() => setExploreGroup(null)} />
    </div>
  );
};

// Meet-by-meet pace trend and range for one group — the "click a group,
// explore" view, mirroring the Dashboard's Season Pace Trend chart (same
// recharts LineChart, same pace-formatted axis) but scoped to this
// group's roster instead of the whole team, and computed live rather
// than off the MeetPerformanceMetrics cache that team-wide chart depends
// on. Min/max are drawn as dashed lines around the solid average line —
// a simple, honest "range" without needing full per-runner gap data.
const GroupTrendDialog = ({
  group,
  dataYear,
  onClose,
}: {
  group: { id: string; name: string } | null;
  dataYear?: number;
  onClose: () => void;
}) => {
  const { data: trend, isLoading } = useGroupTrend(group?.id ?? null, dataYear);

  const chartData = useMemo(
    () =>
      (trend?.points ?? []).map((p) => ({
        name: p.raceName.length > 15 ? `${p.raceName.slice(0, 12)}...` : p.raceName,
        date: formatDateShort(p.date),
        avg: p.avgPaceSecPerMile,
        min: p.minPaceSecPerMile,
        max: p.maxPaceSecPerMile,
        athleteCount: p.athleteCount,
      })),
    [trend]
  );

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{group?.name} — {trend?.dataYear ?? dataYear}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No results for this group in {trend?.dataYear ?? dataYear}.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Average pace per meet (solid), with the group's fastest-to-slowest range (dashed) — how tight the pack ran that day.
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" interval={0} fontSize={12} tickFormatter={(v) => (v.length > 15 ? `${v.slice(0, 12)}...` : v)} />
                <YAxis domain={['dataMin - 15', 'dataMax + 15']} tickFormatter={(val) => formatPace(val)} fontSize={12} />
                <Tooltip formatter={(value: number, key: string) => [formatPace(value), key]} labelStyle={{ color: '#000' }} />
                <Legend />
                <Line type="monotone" dataKey="avg" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} name="Group avg" />
                <Line type="monotone" dataKey="min" stroke="#82ca9d" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Fastest" />
                <Line type="monotone" dataKey="max" stroke="#ffc658" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Slowest" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
