import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService } from '@/api/trackService';
import { TrackRecord } from '@/components/track/TrackRecord';

// An athlete's own track and field record: their marks, their PRs, the
// relays they ran. Nothing about anyone else on the team.
const MyTrackPage: React.FC = () => {
  const { data, isLoading, isError } = useQuery({ queryKey: ['track', 'mine'], queryFn: () => trackService.getMine() });
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader section="neutral" icon={Activity} title="My Track & Field" description="Your marks, your PRs and your relays." />
      {isLoading ? <Skeleton className="h-40 w-full" /> : isError || !data ? <p className="text-sm text-muted-foreground">Could not load your results.</p> : <TrackRecord data={data} />}
    </div>
  );
};

export default MyTrackPage;
