// Client-side half of the no-account Photos tagging path (see
// routes/photos.js's POST /volunteer-login and middleware/photosVolunteer.js
// on the backend). localStorage, not sessionStorage like lib/impersonation.ts
// — this is meant to stick around on a volunteer's phone for the whole
// season, the same "remember this device" choice the spec makes for a
// browser upload batch, not just for the current tab.
//
// Scoped to one team per device: a stored token is only reused when the
// athleticTeamId it was issued for still matches the one being opened.
// Visiting a different team's tagging link naturally prompts for that
// team's password instead of silently reusing a stale, wrong-team token.
const TOKEN_KEY = 'xc_photos_volunteer_token';
const TEAM_KEY = 'xc_photos_volunteer_team';

export function getVolunteerToken(athleticTeamId: string): string | null {
  try {
    if (localStorage.getItem(TEAM_KEY) !== athleticTeamId) return null;
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Unscoped read for axios.ts's interceptor, which attaches whatever
// volunteer token exists (if any) to every request regardless of which
// page issued it — the server is the only thing that ever decides
// whether a token means anything, by looking it up, the same trust
// boundary as every other client-supplied header in this app (see
// api/axios.ts's own header comment on X-Admin-Team-Id).
export function getStoredVolunteerToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setVolunteerToken(athleticTeamId: string, token: string): void {
  try {
    localStorage.setItem(TEAM_KEY, athleticTeamId);
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // A device with storage disabled (private mode, full disk) just has
    // to re-enter the password next time — not worth surfacing an error
    // over for a feature this low-stakes.
  }
}

export function clearVolunteerToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TEAM_KEY);
  } catch {
    /* see setVolunteerToken */
  }
}
