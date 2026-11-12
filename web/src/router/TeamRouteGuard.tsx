import React from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SeasonProvider } from '../contexts/SeasonProvider';
import { teamAddress } from '../lib/teamAddress';

// Sits inside ProtectedRoute, wrapping every /t/:teamSlug/* route.
//
// The URL's team slug is never trusted for authorization — every API
// call is still scoped server-side by the authenticated user's own teamId
// (see backend/middleware/auth.js). This guard exists purely so a stale
// bookmark, an old link, or someone hand-editing the URL lands on the
// coach's OWN team's data (by redirecting to their team's address)
// instead of silently rendering whatever happened to load. That same
// redirect is what carries every old /t/<Athletic.net id>/... link and
// bookmark over to /t/<slug>/... with the rest of the path intact.
//
// Also where SeasonProvider lives — every route under here shares one
// season selection now, including the standalone full-screen routes
// (Interval Sessions, Splits Entry, Race Visualization) that render
// outside <Layout> and so can't get it from there.
const TeamRouteGuard: React.FC = () => {
  const { teamSlug } = useParams<{ teamSlug: string }>();
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

  const address = teamAddress(currentUser.team);
  if (address !== teamSlug) {
    const [, , , ...rest] = location.pathname.split('/'); // drop '', 't', ':teamSlug'
    const correctedPath = `/t/${address}/${rest.join('/')}`;
    return <Navigate to={`${correctedPath}${location.search}`} replace />;
  }

  return (
    <SeasonProvider>
      <Outlet />
    </SeasonProvider>
  );
};

export default TeamRouteGuard;
