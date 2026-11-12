import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { teamAddress } from '../lib/teamAddress';

// Every "main app" route is nested under /t/:teamSlug — the team's own
// LeadPack address, made from its name (backend/lib/teamSlug.js). It used
// to be the Athletic.net team id; that id is still stored and still links
// out to Athletic.net, but LeadPack no longer addresses a team by it.
//
// TeamRouteGuard (router/TeamRouteGuard.tsx) is what actually enforces this
// matches the signed-in coach's own team; nothing here does authorization —
// every API call is still scoped server-side by the authenticated user's
// teamId, never by a value read out of the URL.

/**
 * The :teamSlug path param of the current route, falling back to the
 * signed-in user's own team when the current route isn't nested under
 * /t/:teamSlug at all (e.g. /profile, deliberately outside that tree
 * — see router/index.tsx) but still renders Layout and needs working nav
 * links.
 */
export function useTeamSlug(): string | undefined {
  const { teamSlug } = useParams<{ teamSlug: string }>();
  const { currentUser } = useAuth();
  return teamSlug ?? teamAddress(currentUser?.team);
}

/**
 * Builds a path scoped to the current team, e.g. teamPath('/roster') ->
 * "/t/12345/roster". Use this instead of hardcoding "/roster" etc. in any
 * Link/navigate call under the team-scoped part of the app.
 */
export function useTeamPath() {
  const teamSlug = useTeamSlug();
  return useCallback(
    (subpath: string) => {
      const suffix = subpath.startsWith('/') ? subpath : `/${subpath}`;
      return `/t/${teamSlug ?? ''}${suffix}`;
    },
    [teamSlug]
  );
}
