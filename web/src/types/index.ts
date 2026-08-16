export type Result = {
    'Meet Name': string;
    'Athlete': string;
    'Time': string;
    'Distance': string;
}

export interface Team {
    id: string; // Supabase UUID
    name: string;
    athletic_team_id: string; // Athletic.net ID
    join_code: string;
    coach_uid: string;
    current_season?: number; // The active season for analytics and tools
    importedSeasons?: number[]; // Seasons that have been imported
    // Legacy fields for backward compatibility
    _id?: string; // Deprecated: use id instead
    teamId?: string; // Deprecated: use athletic_team_id instead
    athleticTeamId?: string; // Deprecated: use athletic_team_id instead
    coachUid?: string; // Deprecated: use coach_uid instead
    joinCode?: string; // Deprecated: use join_code instead
    currentSeason?: number; // Deprecated: use current_season instead
}

export interface LinkedAthlete {
    id: string;
    name: string;
    graduationYear?: number | null;
}

export type TeamRole = 'HEAD_COACH' | 'COACH' | 'VOLUNTEER_COACH' | 'ATHLETE';

export interface User {
    uid: string;
    email: string;
    name: string;
    photoURL?: string;
    role: 'coach' | 'captain' | 'athlete';
    team?: Team;
    // The real per-team authorization role (TeamMember.role), distinct from
    // the legacy `role` UX hint above which only distinguishes coach vs
    // athlete. Null if this user has no active membership on their own
    // team. Use this — never `role` — to gate anything HEAD_COACH-specific.
    teamRole?: TeamRole | null;
    // The specific roster row this account is linked to, if any — set by an
    // accepted AthleteInvite or an approved AthleteClaim. A coach who has
    // never raced, or an athlete who hasn't been invited/claimed yet, has
    // none of these and this is null.
    linkedAthlete?: LinkedAthlete | null;
    // Platform super admin (see backend lib/superAdmin.js) — a small,
    // server-side email allowlist. True for every request regardless of
    // whether impersonation is currently active; use isImpersonating to
    // know whether a team has actually been selected.
    isSuperAdmin?: boolean;
    // True only when the server actually resolved an X-Admin-Team-Id header
    // to a real team for this request — team/linkedAthlete above already
    // reflect the impersonated team when this is true.
    isImpersonating?: boolean;
    // True only when the server actually resolved an X-Preview-Athlete-Id
    // header (a coach previewing as one of their own athletes) —
    // linkedAthlete above already reflects that athlete when this is true.
    isPreviewingAthlete?: boolean;
}
