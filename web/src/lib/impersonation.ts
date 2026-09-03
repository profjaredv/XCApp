// Client-side half of two related "act as someone else, temporarily"
// features: a platform super admin viewing/editing a different team, and a
// coach previewing the app as one of their own athletes. Both work the same
// way — a chosen id lives in sessionStorage (survives navigation/refresh
// within the tab, cleared when the tab closes, never silently lingers
// across devices/sessions the way localStorage would), and api/axios.ts
// attaches it as a header on every request. The server (middleware/auth.js)
// is the only thing that ever decides whether that header actually does
// anything — see its own comments for why a client-supplied id here is
// safe (it's only ever honored after an independent, DB-backed check on
// the authenticated user).
const ADMIN_TEAM_ID_KEY = 'xc_admin_team_id';
const ADMIN_TEAM_NAME_KEY = 'xc_admin_team_name';
const PREVIEW_ATHLETE_ID_KEY = 'xc_preview_athlete_id';
const PREVIEW_ATHLETE_NAME_KEY = 'xc_preview_athlete_name';

export function getAdminTeamId(): string | null {
  return sessionStorage.getItem(ADMIN_TEAM_ID_KEY);
}

export function getAdminTeamName(): string | null {
  return sessionStorage.getItem(ADMIN_TEAM_NAME_KEY);
}

// Reloads the page after setting/clearing so every cached query, every
// piece of team-scoped state across the whole app, starts fresh under the
// new identity — simpler and safer than trying to invalidate every
// react-query key by hand for a feature that's used rarely, deliberately,
// and always followed by a full navigation anyway.
export function setAdminTeam(teamId: string, teamName: string, athleticTeamId: string) {
  sessionStorage.setItem(ADMIN_TEAM_ID_KEY, teamId);
  sessionStorage.setItem(ADMIN_TEAM_NAME_KEY, teamName);
  // No destination — clear the preview flag without navigating; the
  // href assignment below is this function's own navigation.
  clearPreviewAthlete();
  window.location.href = `/t/${athleticTeamId}`;
}

export function clearAdminTeam(reload = true) {
  sessionStorage.removeItem(ADMIN_TEAM_ID_KEY);
  sessionStorage.removeItem(ADMIN_TEAM_NAME_KEY);
  // No destination — clear the preview flag without navigating; the
  // conditional reload below is this function's own.
  clearPreviewAthlete();
  // Reload the current URL rather than navigating somewhere new — once the
  // X-Admin-Team-Id header stops being sent, /users/me reverts to the
  // admin's own real team, and TeamRouteGuard (router/TeamRouteGuard.tsx)
  // already knows how to correct a URL that no longer matches
  // currentUser.team (redirecting to the same subpath under their own
  // team, or to /onboarding if they have none) — reusing that instead of
  // guessing a destination here.
  if (reload) window.location.reload();
}

export function getPreviewAthleteId(): string | null {
  return sessionStorage.getItem(PREVIEW_ATHLETE_ID_KEY);
}

export function getPreviewAthleteName(): string | null {
  return sessionStorage.getItem(PREVIEW_ATHLETE_NAME_KEY);
}

export function setPreviewAthlete(athleteId: string, athleteName: string, teamPath: (path: string) => string) {
  sessionStorage.setItem(PREVIEW_ATHLETE_ID_KEY, athleteId);
  sessionStorage.setItem(PREVIEW_ATHLETE_NAME_KEY, athleteName);
  window.location.href = teamPath('/me');
}

// Pass `destination` to navigate there right after clearing — this is
// what "Exit preview" (ImpersonationBanner) uses. Entering preview always
// lands on /me (the athlete's own view), so a bare reload of "wherever
// the tab currently is" reloaded /me too, now under the coach's own
// account, which has no linked athlete — that showed a COACH "Your
// profile isn't linked yet" on every single exit. Omit `destination` when
// a caller (setAdminTeam/clearAdminTeam, below) is already mid-navigation
// and just needs the flag cleared before its own redirect fires.
export function clearPreviewAthlete(destination?: string) {
  sessionStorage.removeItem(PREVIEW_ATHLETE_ID_KEY);
  sessionStorage.removeItem(PREVIEW_ATHLETE_NAME_KEY);
  if (destination) window.location.href = destination;
}
