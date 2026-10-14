import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { axiosInstance as api } from '@/api/axios';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { formatPace } from '@/lib/formatUtils';
import { buildMeetTrend, type GridAthlete, type GridColumn, type MeetTrendPoint } from '@/lib/meetTrend';
import { cn } from '@/lib/utils';
import { MeetsTab } from '@/components/analytics/MeetsTab';
import { DateTile, Panel, SectionHeading } from './Visual';

// Meets → Analysis (next shell): how the team ran at each meet and how
// that moved from race to race, with pace as the common measure. Then
// classic's full per-meet breakdown (Season → Meets in classic), unchanged.

const short = (name: string) => (name.length > 14 ? `${name.slice(0, 13)}…` : name);
const fmtDelta = (d: number) => `${Math.round(Math.abs(d))}s/mi ${d < 0 ? 'faster' : 'slower'}`;

// Team in ink, boys and girls in a blue/orange pair that stays apart for
// color-blind readers; status colors are kept for the faster/slower chips.
const SERIES = [
  { key: 'team', name: 'Team', color: 'var(--foreground)', width: 3 },
  { key: 'boys', name: 'Boys', color: '#2a78d6', width: 2 },
  { key: 'girls', name: 'Girls', color: '#eb6834', width: 2 },
] as const;

const TrendTooltip: React.FC<{ active?: boolean; payload?: Array<{ payload: MeetTrendPoint }> }> = ({ active, payload }) => {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-2xl bg-popover px-3 py-2 text-xs shadow-md ring-1 ring-border">
      <p className="font-semibold">{p.name}</p>
      <p className="mb-1 text-muted-foreground">
        {p.date} · {p.runners} runner{p.runners === 1 ? '' : 's'}
      </p>
      {SERIES.map((s) =>
        p[s.key] != null ? (
          <p key={s.key} className="flex items-center gap-2 tabular-nums">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="w-10 text-muted-foreground">{s.name}</span>
            {formatPace(p[s.key]!)}
          </p>
        ) : null
      )}
      {p.compared > 0 && (
        <p className="mt-1 font-medium">
          {p.faster} of {p.compared} beat their last race's pace
          {p.medianChange != null ? ` (median ${fmtDelta(p.medianChange)})` : ''}
        </p>
      )}
      {p.delta != null && <p className="text-muted-foreground">Team average {fmtDelta(p.delta)} than the meet before</p>}
    </div>
  );
};

export const MeetsAnalysis: React.FC<{ season: number | undefined }> = ({ season }) => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const scope = useGroupScope();
  // The trend reads every athlete's time in every race (the Results Grid
  // payload); the classic breakdown below keeps its own analytics data.
  const { data: grid, isLoading } = useQuery({
    queryKey: ['resultsGrid', season],
    queryFn: async () => (await api.get<{ races: GridColumn[]; athletes: GridAthlete[] }>(`/teams/results-grid?seasons=${season}`)).data,
    enabled: season != null,
  });
  const { data } = useAnalyticsData(season);
  const meets = useMemo(() => data?.meets ?? [], [data]);
  const athletes = useMemo(() => data?.athletes ?? [], [data]);
  const trend = useMemo(
    () => (grid ? buildMeetTrend(grid.races, grid.athletes, scope.athleteIdsInScope) : []),
    [grid, scope.athleteIdsInScope]
  );
  const scoped = !!scope.athleteIdsInScope;

  if (isLoading) return <Skeleton className="h-72 w-full rounded-3xl" />;
  if (trend.length === 0) {
    return <p className="text-sm text-muted-foreground">No meet results yet this season. The trend appears after the first meet's results are in.</p>;
  }

  const first = trend[0];
  const last = trend[trend.length - 1];
  const seasonDelta = trend.length > 1 && first.team != null && last.team != null ? last.team - first.team : null;
  const paces = trend.flatMap((p) => [p.team, p.boys, p.girls]).filter((v): v is number => v != null);
  const lo = Math.floor((Math.min(...paces) - 10) / 15) * 15;
  const hi = Math.ceil((Math.max(...paces) + 10) / 15) * 15;

  return (
    <div className="space-y-6">
      <Panel
        title="Pace, meet to meet"
        action={
          seasonDelta != null && (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                seasonDelta < 0 ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
              )}
            >
              Team avg {fmtDelta(seasonDelta)} since {short(first.name)}
            </span>
          )
        }
      >
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">
          Average pace per meet{scoped ? ` for ${scope.label}` : ''}. Faster is up. Pace puts different distances on one scale; course and weather still
          matter, and an average also moves with who ran, so each meet below compares athletes with their own last race.
        </p>
        <div className="h-64 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickFormatter={short} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" />
              <YAxis
                reversed
                domain={[lo, hi]}
                tickFormatter={(v: number) => formatPace(v).replace('/mi', '')}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={s.width}
                  dot={{ r: 4, strokeWidth: 2, fill: 'var(--card)' }}
                  activeDot={{ r: 6 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <section>
        <SectionHeading title="Meet to meet" />
        <div className="rounded-3xl bg-card p-1.5 shadow-sm ring-1 ring-border/60">
          {[...trend].reverse().map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={!p.meetId}
              onClick={() => p.meetId && navigate(teamPath(`/meet/${p.meetId}?tab=results`))}
              className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left enabled:hover:bg-accent/60"
            >
              <DateTile date={p.date} className="bg-muted text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[p.boys != null ? `Boys ${formatPace(p.boys)}` : null, p.girls != null ? `Girls ${formatPace(p.girls)}` : null, `${p.runners} ran`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {(p.compared > 0 || p.seasonBests > 0) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.compared > 0 && (
                      <span
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold"
                        title="Athletes who ran an earlier meet, compared with their own previous race's pace"
                      >
                        {p.faster} of {p.compared} faster than last race
                      </span>
                    )}
                    {p.seasonBests > 0 && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {p.seasonBests} season best{p.seasonBests === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-lg font-bold tabular-nums">{p.team != null ? formatPace(p.team) : '—'}</span>
                {p.medianChange != null ? (
                  <span
                    className={cn('block text-[11px] font-semibold tabular-nums', p.medianChange <= 0 ? 'text-primary' : 'text-amber-700 dark:text-amber-400')}
                    title="Median change in pace against each athlete's own previous race"
                  >
                    {p.medianChange <= 0 ? '▲' : '▼'} {fmtDelta(p.medianChange)}
                  </span>
                ) : (
                  <span className="block text-[11px] text-muted-foreground">first meet</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>

      {meets.length > 0 && (
        <section>
          <SectionHeading title="Meet breakdown" />
          <MeetsTab meets={meets} athletes={athletes} />
        </section>
      )}
    </div>
  );
};
