import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService } from '@/api/trackService';
import { formatMark, formatMeetDate, formatResult } from '@/lib/trackFormat';
import { useTeamPath } from '@/hooks/useTeamRoute';

// One athlete's track marks, event by event: the PR, the best of each
// season, and every result with the ones that set a new PR marked.
const TrackAthletePage: React.FC = () => {
  const { athleteId = '' } = useParams();
  const teamPath = useTeamPath();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['track', 'athlete', athleteId],
    queryFn: () => trackService.getAthlete(athleteId),
    enabled: Boolean(athleteId),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Link to={teamPath('/track/leaders')} className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="h-4 w-4" /> Leaders
      </Link>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !data ? (
        <p className="text-sm text-muted-foreground">Could not load this athlete.</p>
      ) : (
        <>
          <PageHeader
            section="neutral"
            icon={Activity}
            title={data.athlete.name}
            description={data.athlete.graduationYear ? `Class of ${data.athlete.graduationYear}` : 'Track & Field'}
          />
          {data.events.length === 0 && <p className="text-sm text-muted-foreground">No track results for this athlete yet.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {data.events.map(({ event, pr, marks, seasonBests }) => (
              <Card key={event.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{event.name}</CardTitle>
                  <CardDescription>
                    {pr != null ? `PR ${formatMark(pr, event.unit)}` : 'No mark yet'}
                    {seasonBests.length > 1 && ` · ${seasonBests.map((s) => `${s.season}: ${formatMark(s.best.markValue, event.unit)}`).join(', ')}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm">
                    {[...marks].reverse().map((m) => (
                      <li key={m.id} className="flex items-baseline gap-2">
                        <span className="w-24 shrink-0 text-muted-foreground">{formatMeetDate(m.date)}</span>
                        <span className="min-w-0 flex-1 truncate">{m.meetName}</span>
                        {m.isPr && <span className="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">PR</span>}
                        <span className="shrink-0 font-semibold tabular-nums">{formatResult(m, event.unit)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TrackAthletePage;
