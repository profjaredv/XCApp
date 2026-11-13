import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Medal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EVENT_GROUPS, eventGroupOf } from '@/lib/trackEventGroups';
import { trackService, type TrackGender } from '@/api/trackService';
import { formatResult } from '@/lib/trackFormat';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { Empty, TrackScreen } from './trackShared';

// Track is organised around events, and there are a lot of them, so they
// are shown by event group with a filter rather than as one long wall.
const Events: React.FC<{ year: number; gender: TrackGender }> = ({ year, gender }) => {
  const teamPath = useTeamPath();
  const [group, setGroup] = useState<string>('ALL');
  const { data, isLoading } = useQuery({ queryKey: ['track', 'leaders', year, gender], queryFn: () => trackService.getLeaders(year, gender) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <Empty>No marks for this group in {year} yet.</Empty>;

  const present = EVENT_GROUPS.filter((g) => data.some((d) => eventGroupOf(d.event) === g.key));
  const shown = present.filter((g) => group === 'ALL' || g.key === group);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Event group">
        {[{ key: 'ALL', label: 'All events' }, ...present].map((g) => (
          <Button key={g.key} type="button" size="sm" variant={group === g.key ? 'secondary' : 'ghost'} onClick={() => setGroup(g.key)}>
            {g.label}
          </Button>
        ))}
      </div>
      {shown.map((g) => (
        <section key={g.key} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {data
              .filter((d) => eventGroupOf(d.event) === g.key)
              .map(({ event, leaders, relays }) => (
                <Card key={event.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{event.name}</CardTitle>
                    <CardDescription>
                      {event.isRelay
                        ? `${relays.length} time${relays.length === 1 ? '' : 's'} this season`
                        : `${leaders.length} athlete${leaders.length === 1 ? '' : 's'} with a mark`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-1 text-sm">
                      {leaders.slice(0, 8).map((r, i) => (
                        <li key={r.id} className="flex items-baseline gap-2">
                          <span className="w-5 shrink-0 text-right text-muted-foreground">{i + 1}</span>
                          <Link to={teamPath(`/track/athlete/${r.athleteId}`)} className="min-w-0 flex-1 truncate hover:underline">
                            {r.athleteName}
                            {r.grade ? <span className="text-muted-foreground"> · {r.grade}</span> : null}
                          </Link>
                          <span className="shrink-0 font-semibold tabular-nums">{formatResult(r, event.unit)}</span>
                        </li>
                      ))}
                    </ol>
                    {relays.length > 0 && (
                      <ol className="space-y-2 text-sm">
                        {relays.slice(0, 6).map((r, i) => (
                          <li key={r.id}>
                            <div className="flex items-baseline gap-2">
                              <span className="w-5 shrink-0 text-right text-muted-foreground">{i + 1}</span>
                              <span className="min-w-0 flex-1 truncate">
                                {r.relayTeam ? `${r.relayTeam} squad · ` : ''}
                                {r.meetName}
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums">{formatResult(r, event.unit)}</span>
                            </div>
                            <p className="pl-7 text-xs text-muted-foreground">{r.legs.map((l) => l.name).join(' → ')}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                    {leaders.length > 8 && <p className="mt-2 text-xs text-muted-foreground">and {leaders.length - 8} more</p>}
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
};

const TrackEventsPage: React.FC = () => (
  <TrackScreen icon={Medal} title="Events" description="Every event the team has marks in, with each athlete's best this season." showGender showSeason>
    {({ year, gender }) => <Events year={year} gender={gender} />}
  </TrackScreen>
);

export default TrackEventsPage;
