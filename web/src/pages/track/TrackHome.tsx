import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService } from '@/api/trackService';
import { formatMark, formatMeetDate } from '@/lib/trackFormat';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { TrackScreen, useTrackSeasons } from './trackShared';

// Track & Field's home: what is coming up, what just happened, and the
// season so far. A team with nothing imported yet goes to the import.

const Stat: React.FC<{ label: string; value: number; to: string }> = ({ label, value, to }) => (
  <Link to={to} className="rounded-xl border bg-card p-4 hover:bg-muted/50">
    <div className="text-2xl font-semibold tabular-nums">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </Link>
);

const Summary: React.FC<{ year: number }> = ({ year }) => {
  const teamPath = useTeamPath();
  const { data, isLoading } = useQuery({ queryKey: ['track', 'summary', year], queryFn: () => trackService.getSummary(year) });
  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Athletes on the roster" value={data.rosterCount} to={teamPath('/track/roster')} />
        <Stat label="Meets competed" value={data.meetCount} to={teamPath('/track/meets')} />
        <Stat label="Events with marks" value={data.eventCount} to={teamPath('/track/events')} />
        <Stat label="Results" value={data.resultCount} to={teamPath('/track/events')} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Coming up</CardTitle>
            <CardDescription>Meets on the schedule that have not been run.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing scheduled.{' '}
                <Link to={teamPath('/track/meets')} className="underline">
                  Add a meet
                </Link>{' '}
                to enter athletes and build relays ahead of time.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.upcoming.map((m) => (
                  <li key={m.id} className="flex items-baseline gap-2">
                    <span className="w-24 shrink-0 text-muted-foreground">{formatMeetDate(m.date)}</span>
                    <Link to={teamPath(`/track/meet/${m.id}`)} className="min-w-0 flex-1 truncate hover:underline">
                      {m.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {data.lastMeet ? (
                <Link to={teamPath(`/track/meet/${data.lastMeet.id}`)} className="hover:underline">
                  Last meet: {data.lastMeet.name}
                </Link>
              ) : (
                'Last meet'
              )}
            </CardTitle>
            <CardDescription>
              {data.lastMeet ? `${formatMeetDate(data.lastMeet.date)} · ${data.lastMeetPrs.length} personal record${data.lastMeetPrs.length === 1 ? '' : 's'}` : 'No meets yet this season.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.lastMeetPrs.slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-baseline gap-2">
                  <Link to={teamPath(`/track/athlete/${p.athleteId}`)} className="min-w-0 flex-1 truncate hover:underline">
                    {p.athleteName} <span className="text-muted-foreground">· {p.event.name}</span>
                  </Link>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMark(p.markValue, p.event.unit)}</span>
                  {p.previous != null && <span className="shrink-0 text-xs text-muted-foreground">was {formatMark(p.previous, p.event.unit)}</span>}
                </li>
              ))}
            </ul>
            {data.lastMeetPrs.length > 12 && <p className="mt-2 text-xs text-muted-foreground">and {data.lastMeetPrs.length - 12} more</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const TrackHome: React.FC = () => {
  const teamPath = useTeamPath();
  const { data: seasons, isLoading } = useTrackSeasons();
  if (isLoading) return <Skeleton className="m-8 h-40" />;
  if (seasons && seasons.length === 0) return <Navigate to={teamPath('/track/import')} replace />;
  return (
    <TrackScreen icon={Home} title="Track & Field" description="What is coming up, what just happened, and the season so far." showSeason>
      {({ year }) => <Summary year={year} />}
    </TrackScreen>
  );
};

export default TrackHome;
