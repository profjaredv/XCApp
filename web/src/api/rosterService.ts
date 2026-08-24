import api from './api';

export type InviteStatus = 'not_invited' | 'pending' | 'accepted' | 'expired' | 'revoked';

export interface RosterAthlete {
  id: string;
  name: string;
  gender?: string | null;
  /** Derived for the requested season, not stored on the athlete. */
  grade: number | null;
  graduationYear: number | null;
  raceCount: number;
  graduated: boolean;
  onRoster: boolean;
  /** Set once this row is linked to a Neon Auth account (accepted invite or approved claim). */
  user?: string;
  invite?: {
    status: InviteStatus;
    email?: string;
    sentAt?: string;
    acceptedAt?: string;
  };
  /** Active on the roster, but missing from the last Athletic.net sync — needs a coach's review. */
  flaggedForRemoval?: boolean;
  /** Captaincy is annual — lives on the per-season roster row, not the athlete. */
  isCaptain?: boolean;
  captainNotes?: string | null;
  /** The season row's id, needed to call setCaptain below. Null if no explicit Season row exists yet. */
  seasonId?: string | null;
}

export interface RosterSyncResult {
  success: boolean;
  season: number;
  totalScraped: number;
  added: string[];
  reactivated: string[];
  updated: string[];
  flaggedForRemoval: string[];
  message: string;
}

export interface RosterImportResult {
  msg: string;
  imported: number;
  matched: number;
  skipped: number;
  warnings: Array<{ row: number; message: string }>;
}

export interface StartSeasonResult {
  success: boolean;
  season: number;
  fromSeason: number | null;
  carriedCount: number;
  graduatedCount: number;
  carried: Array<{ id: string; name: string; grade: number | null }>;
  graduated: Array<{ id: string; name: string; graduationYear: number }>;
  /** Athletes with no graduation year — we can't tell if they aged out. */
  needsReview: Array<{ id: string; name: string }>;
  message: string;
}

export const rosterService = {
  async getRoster(season?: number, opts?: { activeOnly?: boolean }): Promise<RosterAthlete[]> {
    const response = await api.get<RosterAthlete[]>('/athletes', {
      params: {
        ...(season ? { season } : {}),
        activeOnly: opts?.activeOnly ?? true,
      },
    });
    return response.data;
  },

  async addAthlete(input: {
    name: string;
    grade?: number;
    graduationYear?: number;
    gender?: string;
    season?: number;
  }): Promise<RosterAthlete> {
    const response = await api.post<RosterAthlete>('/athletes', input);
    return response.data;
  },

  async updateAthlete(
    athleteId: string,
    input: { name?: string; grade?: number; graduationYear?: number; gender?: string; season?: number }
  ): Promise<RosterAthlete> {
    const response = await api.put<RosterAthlete>(`/athletes/${athleteId}`, input);
    return response.data;
  },

  /**
   * For athletes an Athletic.net scrape can't see yet (freshmen with no
   * race history, or anyone not on Athletic.net at all) — reconciles
   * against every athlete already on the team by name before creating
   * anyone new, so re-running this doesn't create duplicates.
   */
  async importRoster(season: number, csvData: string): Promise<RosterImportResult> {
    const response = await api.post<RosterImportResult>('/athletes/import-roster', { season, csvData });
    return response.data;
  },

  /** Consolidates two Athlete rows that turned out to be the same person — keeperId survives, loserId's history moves onto it and the row is deleted. Head-coach only. */
  async mergeAthletes(keeperId: string, loserId: string): Promise<{ msg: string; keeperId: string; deletedId: string }> {
    const response = await api.post('/athletes/merge', { keeperId, loserId });
    return response.data;
  },

  /** Roll the roster into a new season: returning athletes move up, seniors age out. */
  async startSeason(year: number, opts?: { fromSeason?: number }): Promise<StartSeasonResult> {
    const response = await api.post<StartSeasonResult>(`/teams/seasons/${year}/start`, {
      ...(opts?.fromSeason ? { fromSeason: opts.fromSeason } : {}),
    });
    return response.data;
  },

  async addToRoster(season: number, athleteId: string, grade?: number) {
    const response = await api.post(`/teams/seasons/${season}/roster`, { athleteId, grade });
    return response.data;
  },

  /** Deactivates the roster entry; the athlete's results are never deleted. */
  async removeFromRoster(season: number, athleteId: string) {
    const response = await api.delete(`/teams/seasons/${season}/roster/${athleteId}`);
    return response.data;
  },

  /**
   * Pulls the current roster from Athletic.net and merges it in: adds new
   * athletes, reactivates/updates matches, and flags anyone missing for
   * review — never removes anyone automatically.
   */
  async syncFromAthleticNet(season: number): Promise<RosterSyncResult> {
    const response = await api.post<RosterSyncResult>('/teams/scrape-roster', { year: season });
    return response.data;
  },

  /** Clears a "flagged for removal" review flag without touching roster membership. */
  async clearRemovalFlag(season: number, athleteId: string) {
    const response = await api.post(`/teams/seasons/${season}/roster/${athleteId}/clear-flag`);
    return response.data;
  },

  /**
   * Sets or clears the captain designation for one athlete on one season's
   * roster. Coach-only, entirely server-side — the athlete never needs to
   * sign in or accept anything for this to take effect.
   */
  async setCaptain(seasonId: string, athleteId: string, isCaptain: boolean, captainNotes?: string) {
    const response = await api.patch(`/seasons/${seasonId}/roster/${athleteId}`, {
      isCaptain,
      ...(captainNotes !== undefined ? { captainNotes } : {}),
    });
    return response.data;
  },
};
