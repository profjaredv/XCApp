// What the person told us before they had an account.
//
// The sign-up wizard asks who you are and which team you mean BEFORE
// handing off to Neon Auth, because those two answers decide everything
// that follows — and asking them afterwards is what made the old flow
// feel arbitrary. Auth redirects through its own pages and back, so the
// answers have to survive a full navigation: sessionStorage, same
// mechanism the invite pages already use for `redirectUrl`.
//
// Deliberately sessionStorage and not localStorage. This is a single
// sign-up in progress, not a preference; if someone closes the tab and
// comes back tomorrow they should be asked again rather than silently
// resuming a half-finished intent they have forgotten.

export type SignupRole = 'coach' | 'athlete' | 'parent';

export interface SignupIntent {
  role: SignupRole;
  /** The team they picked out of search, if it exists on LeadPack. */
  teamId?: string;
  teamName?: string;
  athleticTeamId?: string;
  /** True when they searched and told us their team is not listed. */
  teamNotListed?: boolean;
  /** What they typed, kept even when nothing matched — it becomes the
   *  team name on the request rather than being thrown away. */
  searchedFor?: string;
}

const KEY = 'leadpack.signupIntent';

export function saveIntent(intent: SignupIntent): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Private browsing, or storage disabled. The wizard still works — the
    // resolver just falls back to asking again rather than crashing.
  }
}

export function readIntent(): SignupIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupIntent;
    // Anything without a role is not usable and would send the resolver
    // down an arbitrary branch.
    if (!parsed || (parsed.role !== 'coach' && parsed.role !== 'athlete' && parsed.role !== 'parent')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearIntent(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do — a stale intent is re-validated by readIntent anyway.
  }
}
