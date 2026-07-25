import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Redirects a pre-team-scoped-URL path (e.g. "/analytics") to its
// /t/:athleticTeamId equivalent, so bookmarks and links made before this
// rework don't 404. Not rendered under TeamRouteGuard — these routes have no
// athleticTeamId of their own, they exist purely to bounce to the one that
// does.
const LegacyRedirect: React.FC<{
  toSubpath: string | ((params: Readonly<Record<string, string | undefined>>) => string);
}> = ({ toSubpath }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  const params = useParams();

  if (loading) return null;
  if (!currentUser?.team) return <Navigate to="/onboarding" replace />;

  const subpath = typeof toSubpath === 'function' ? toSubpath(params) : toSubpath;
  return <Navigate to={`/t/${currentUser.team.athleticTeamId}${subpath}${location.search}`} replace />;
};

export default LegacyRedirect;
