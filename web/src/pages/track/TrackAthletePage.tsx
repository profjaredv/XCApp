import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService } from '@/api/trackService';
import { TrackRecord } from '@/components/track/TrackRecord';
import { useTeamPath } from '@/hooks/useTeamRoute';

// The coach's view of one athlete's track record.
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
      <Link to={teamPath('/track/roster')} className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="h-4 w-4" /> Roster
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
          <TrackRecord data={data} />
        </>
      )}
    </div>
  );
};

export default TrackAthletePage;
