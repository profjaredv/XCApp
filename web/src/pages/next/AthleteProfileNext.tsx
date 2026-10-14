import React from 'react';
import { useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { AthleteInspector } from '@/components/next/AthleteInspector';
import { useAthleteRows } from '@/components/next/useAthleteRows';
import TeamAthleteProfilePage from '../TeamAthleteProfilePage';

// /athlete/:id in the next shell (docs/leadpack-new-ui-trial.md §4.4):
// below 1280px, selecting an athlete lands here instead of an inspector
// panel. It is the same inspector, full page. Athletes and parents, and
// any athlete not on this season's roster, keep classic's profile page.
const AthleteProfileNext: React.FC = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { currentUser } = useAuth();
  const isCoach = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'].includes(currentUser?.teamRole ?? '');
  if (!isCoach || !athleteId) return <TeamAthleteProfilePage />;
  return <CoachAthletePage athleteId={athleteId} />;
};

const CoachAthletePage: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const { rows, isLoading, season } = useAthleteRows(true);
  const athlete = rows.find((r) => r.id === athleteId);
  if (isLoading) return <Skeleton className="mx-auto h-64 max-w-3xl rounded-3xl" />;
  if (!athlete) return <TeamAthleteProfilePage />;
  return (
    <div className="mx-auto max-w-3xl">
      <AthleteInspector athlete={athlete} season={season} variant="page" />
    </div>
  );
};

export default AthleteProfileNext;
