import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService, type TrackGender } from '@/api/trackService';
import { Empty, TrackScreen } from './trackShared';

const Points: React.FC<{ gender: TrackGender }> = ({ gender }) => {
  const { data, isLoading } = useQuery({ queryKey: ['track', 'points', gender], queryFn: () => trackService.getPoints(gender) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.events.length) return <Empty>No results imported for this group yet.</Empty>;
  const totals = data.seasons.map((s) => data.events.reduce((sum, e) => sum + (e.bySeason[s]?.points ?? 0), 0));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Points by event</CardTitle>
        <CardDescription>
          Places in finals, scored {data.table.join('-')} for the top {data.table.length}. That table is an assumption: meets score
          differently, so read this as where the team places, not as official meet scores. The small number is how many athletes scored.
        </CardDescription>
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
            {data.events.map(({ event, bySeason }) => (
              <tr key={event.id} className="border-b last:border-0">
                <td className="py-1.5 pr-4">{event.name}</td>
                {data.seasons.map((s) => {
                  const cell = bySeason[s];
                  return (
                    <td key={s} className="px-2 py-1.5 text-right tabular-nums">
                      {cell ? (
                        <>
                          <span className={cell.points ? 'font-semibold' : 'text-muted-foreground'}>{cell.points}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({cell.scorers})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-4">Total</td>
              {totals.map((t, i) => (
                <td key={data.seasons[i]} className="px-2 py-2 text-right tabular-nums">
                  {t}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

const TrackPointsPage: React.FC = () => (
  <TrackScreen icon={BarChart3} title="Points" description="Where the team scores, event by event, across every season you've imported." showGender>
    {({ gender }) => <Points gender={gender} />}
  </TrackScreen>
);

export default TrackPointsPage;
