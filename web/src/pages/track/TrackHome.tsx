import React from 'react';
import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTrackSeasons } from './trackShared';

/** Where "Track & Field" lands: the events once there are results, the import until then. */
const TrackHome: React.FC = () => {
  const teamPath = useTeamPath();
  const { data: seasons, isLoading } = useTrackSeasons();
  if (isLoading) return <Skeleton className="m-8 h-40" />;
  return <Navigate to={teamPath(seasons?.length ? '/track/events' : '/track/import')} replace />;
};

export default TrackHome;
