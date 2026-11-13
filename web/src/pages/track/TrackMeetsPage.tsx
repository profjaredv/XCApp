import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService } from '@/api/trackService';
import { formatMeetDate } from '@/lib/trackFormat';
import { Empty, TrackScreen } from './trackShared';

const Meets: React.FC<{ year: number }> = ({ year }) => {
  const { data, isLoading } = useQuery({ queryKey: ['track', 'meets', year], queryFn: () => trackService.getMeets(year) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <Empty>No meets imported for {year} yet.</Empty>;
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {data.map((m) => (
          <div key={m.id} className="flex items-baseline gap-3 px-4 py-3 text-sm">
            <span className="w-28 shrink-0 text-muted-foreground">{formatMeetDate(m.date)}</span>
            <span className="min-w-0 flex-1 truncate">
              {m.sourceUrl ? (
                <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {m.name}
                </a>
              ) : (
                m.name
              )}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {m.resultCount} result{m.resultCount === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const TrackMeetsPage: React.FC = () => (
  <TrackScreen icon={Flag} title="Meets" description="Every track and field meet you've imported this season." showSeason>
    {({ year }) => <Meets year={year} />}
  </TrackScreen>
);

export default TrackMeetsPage;
