import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Every "main app" route is nested under /t/:athleticTeamId — the
// Athletic.net team ID, not the internal database UUID. It's the right
// identifier for a URL: it's globally unique (unique DB constraint — a given
// Athletic.net team can only ever be claimed by one team here), stable, and
// human-readable, unlike the UUID that used to leak into a couple of routes.
//
// TeamRouteGuard (router/TeamRouteGuard.tsx) is what actually enforces this
// matches the signed-in coach's own team; nothing here does authorization —
// every API call is still scoped server-side by the authenticated user's
// teamId, never by a value read out of the URL.

/**
 * The :athleticTeamId path param of the current route, falling back to the
 * signed-in user's own team when the current route isn't nested under
 * /t/:athleticTeamId at all (e.g. /profile, deliberately outside that tree
 * — see router/index.tsx) but still renders Layout and needs working nav
 * links.
 */
export function useAthleticTeamId(): string | undefined {
  const { athleticTeamId } = useParams<{ athleticTeamId: string }>();
  const { currentUser } = useAuth();
  return athleticTeamId ?? currentUser?.team?.athleticTeamId ?? currentUser?.team?.athletic_team_id;
}

/**
 * Builds a path scoped to the current team, e.g. teamPath('/roster') ->
 * "/t/12345/roster". Use this instead of hardcoding "/roster" etc. in any
 * Link/navigate call under the team-scoped part of the app.
 */
export function useTeamPath() {
  const athleticTeamId = useAthleticTeamId();
  return useCallback(
    (subpath: string) => {
      const suffix = subpath.startsWith('/') ? subpath : `/${subpath}`;
      return `/t/${athleticTeamId ?? ''}${suffix}`;
    },
    [athleticTeamId]
  );
}
