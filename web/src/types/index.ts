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

export interface User {
    uid: string;
    email: string;
    name: string;
    photoURL?: string;
    role: 'coach' | 'captain' | 'athlete';
    team?: Team;
    // The specific roster row this account is linked to, if any — set by an
    // accepted AthleteInvite or an approved AthleteClaim. A coach who has
    // never raced, or an athlete who hasn't been invited/claimed yet, has
    // none of these and this is null.
    linkedAthlete?: LinkedAthlete | null;
}
