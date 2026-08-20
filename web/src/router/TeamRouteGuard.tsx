import React from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SeasonProvider } from '../contexts/SeasonProvider';

// Sits inside ProtectedRoute, wrapping every /t/:athleticTeamId/* route.
//
// The URL's athleticTeamId is never trusted for authorization — every API
// call is still scoped server-side by the authenticated user's own teamId
// (see backend/middleware/auth.js). This guard exists purely so a stale
// bookmark, an old link, or someone hand-editing the URL lands on the
// coach's OWN team's data (by redirecting to the correct athleticTeamId)
// instead of silently rendering whatever happened to load.
//
// Also where SeasonProvider lives — every route under here shares one
// season selection now, including the standalone full-screen routes
// (Interval Sessions, Splits Entry, Race Visualization) that render
// outside <Layout> and so can't get it from there.
const TeamRouteGuard: React.FC = () => {
  const { athleticTeamId } = useParams<{ athleticTeamId: string }>();
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (!currentUser?.team) {
    return <Navigate to="/onboarding" replace />;
  }

  if (currentUser.team.athleticTeamId !== athleticTeamId) {
    const [, , , ...rest] = location.pathname.split('/'); // drop '', 't', ':athleticTeamId'
    const correctedPath = `/t/${currentUser.team.athleticTeamId}/${rest.join('/')}`;
    return <Navigate to={`${correctedPath}${location.search}`} replace />;
  }

  return (
    <SeasonProvider>
      <Outlet />
    </SeasonProvider>
  );
};

export default TeamRouteGuard;
