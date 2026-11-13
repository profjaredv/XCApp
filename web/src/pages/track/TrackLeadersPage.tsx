import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Medal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService, type TrackGender } from '@/api/trackService';
import { formatResult } from '@/lib/trackFormat';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { Empty, TrackScreen } from './trackShared';

const Leaders: React.FC<{ year: number; gender: TrackGender }> = ({ year, gender }) => {
  const teamPath = useTeamPath();
  const { data, isLoading } = useQuery({ queryKey: ['track', 'leaders', year, gender], queryFn: () => trackService.getLeaders(year, gender) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <Empty>No marks for this group in {year} yet.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map(({ event, leaders }) => (
        <Card key={event.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{event.name}</CardTitle>
            <CardDescription>
              {leaders.length} athlete{leaders.length === 1 ? '' : 's'} with a mark
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
            {leaders.length > 8 && <p className="mt-2 text-xs text-muted-foreground">and {leaders.length - 8} more</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const TrackLeadersPage: React.FC = () => (
  <TrackScreen icon={Medal} title="Leaders" description="Each athlete's best mark this season, event by event." showGender showSeason>
    {({ year, gender }) => <Leaders year={year} gender={gender} />}
  </TrackScreen>
);

export default TrackLeadersPage;
