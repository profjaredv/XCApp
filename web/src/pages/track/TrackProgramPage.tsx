import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { trackService, type TrackGender, type TrackProgramCell } from '@/api/trackService';
import { EVENT_GROUPS, eventGroupOf } from '@/lib/trackEventGroups';
import { formatMark } from '@/lib/trackFormat';
import { Empty, TrackScreen } from './trackShared';

// The program, event by event, season over season. One question at a time
// (the best mark, the depth behind it, how many athletes, how much they
// improved) so the table stays one number per cell and reads across years.

type Metric = 'best' | 'depth' | 'athletes' | 'inSeason' | 'returning';

const METRICS: Array<{ key: Metric; label: string; explain: (depth: number) => string }> = [
  { key: 'best', label: 'Best mark', explain: () => "The team's best mark in each event, and whose it was." },
  { key: 'depth', label: 'Depth', explain: (d) => `The average of the top ${d} athletes' season bests. Fewer than ${d} with a mark is shown in brackets.` },
  { key: 'athletes', label: 'Athletes', explain: () => 'How many athletes have a mark in the event.' },
  { key: 'inSeason', label: 'Improved in season', explain: () => 'Average improvement from an athlete\'s first mark of the season to their best, for athletes with two or more marks. The bracket is how many.' },
  { key: 'returning', label: 'Returners vs last year', explain: () => 'Average change in season best against the year before, for athletes with a mark in both. The bracket is how many.' },
];

const pct = (v: number | null) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

function cellText(metric: Metric, c: TrackProgramCell | undefined, unit: string, depth: number): { main: string; note?: string; tone?: 'up' | 'down' } {
  if (!c) return { main: '–' };
  if (metric === 'best') return { main: formatMark(c.best, unit), note: c.bestAthleteName ?? undefined };
  if (metric === 'depth') return { main: formatMark(c.depthAvg, unit), note: c.depthCount < depth ? `(${c.depthCount})` : undefined };
  if (metric === 'athletes') return { main: String(c.athletes) };
  const value = metric === 'inSeason' ? c.inSeasonPct : c.returningPct;
  const count = metric === 'inSeason' ? c.inSeasonCount : c.returners;
  return { main: pct(value), note: count ? `(${count})` : undefined, tone: value == null || value === 0 ? undefined : value > 0 ? 'up' : 'down' };
}

const Program: React.FC<{ gender: TrackGender }> = ({ gender }) => {
  const [metric, setMetric] = useState<Metric>('best');
  const { data, isLoading } = useQuery({ queryKey: ['track', 'program', gender], queryFn: () => trackService.getProgram(gender) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.events.length) return <Empty>No results imported for this group yet.</Empty>;
  const groups = EVENT_GROUPS.map((g) => ({ ...g, events: data.events.filter((e) => eventGroupOf(e.event) === g.key) })).filter((g) => g.events.length);
  const active = METRICS.find((m) => m.key === metric)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="What to compare">
        {METRICS.map((m) => (
          <Button key={m.key} type="button" size="sm" variant={metric === m.key ? 'secondary' : 'ghost'} onClick={() => setMetric(m.key)}>
            {m.label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{active.explain(data.depth)}</p>
      {groups.map((g) => (
        <Card key={g.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{g.label}</CardTitle>
            <CardDescription>{active.label}, by season</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Event</th>
                  {data.seasons.map((s) => (
                    <th key={s} className="px-2 py-2 text-right font-medium">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.events.map(({ event, bySeason }) => (
                  <tr key={event.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-4">{event.name}</td>
                    {data.seasons.map((s) => {
                      const c = cellText(metric, bySeason[s], event.unit, data.depth);
                      return (
                        <td key={s} className="px-2 py-1.5 text-right tabular-nums">
                          <span className={c.tone === 'up' ? 'font-semibold text-primary' : c.tone === 'down' ? 'text-destructive' : c.main === '–' ? 'text-muted-foreground' : 'font-semibold'}>
                            {c.main}
                          </span>
                          {c.note && <span className="ml-1 text-xs text-muted-foreground">{c.note}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const TrackProgramPage: React.FC = () => (
  <TrackScreen icon={TrendingUp} title="Program" description="Every event, season over season: the best marks, the depth behind them, and how much athletes improve." showGender>
    {({ gender }) => <Program gender={gender} />}
  </TrackScreen>
);

export default TrackProgramPage;
