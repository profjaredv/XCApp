import { axiosInstance } from './axios';
import type { TeamPerformance } from '../types/team';

export interface JoinCodeResponse {
  msg: string;
  joinCode: string;
}

export interface JoinTeamResponse {
  msg: string;
  teamId: string;
  teamName: string;
  availableProfiles: Array<{
    _id: string;
    name: string;
  }>;
}

export interface ClaimProfileResponse {
  msg: string;
  athleteName: string;
  matchScore: number;
}

export interface PendingClaim {
  _id: string;
  userId: string;
  athleteName: string;
  athleteId: string;
  requestedAt: string;
  matchScore: number;
}

export const teamService = {
  /**
   * Get team performance data for a specific season
   */
  async getTeamPerformance(seasonYear?: number): Promise<TeamPerformance> {
    const response = await axiosInstance.get<TeamPerformance>('/team/performance', {
      // See athleteService.getAthletes: omit season so the server resolves it.
      params: seasonYear ? { season: seasonYear } : {}
    });
    return response.data;
  },

  /**
   * Get historical team performance for multiple seasons
   */
  async getTeamHistory(years: number[]): Promise<Record<number, TeamPerformance>> {
    const response = await axiosInstance.get<Record<number, TeamPerformance>>('/team/history', {
      params: { years: years.join(',') }
    });
    return response.data;
  },

  /**
   * Get team roster for a specific season
   */
  async getTeamRoster(seasonYear?: number): Promise<{
    athletes: Array<{ id: string; name: string; grade: number; gender: string }>;
    coaches: string[];
  }> {
    const response = await axiosInstance.get('/team/roster', {
      params: seasonYear ? { season: seasonYear } : {}
    });
    return response.data;
  },

  /**
   * Update team information
   */
  async updateTeam(data: Partial<TeamPerformance>): Promise<TeamPerformance> {
    const response = await axiosInstance.patch<TeamPerformance>('/team', data);
    return response.data;
  },

  /**
   * Get all available seasons with data
   */
  async getAvailableSeasons(): Promise<number[]> {
    // /teams/seasons returns season objects (year plus roster/race counts) so
    // the UI can tell a roster-only preseason from one with results. Callers
    // that only need the years get them projected out here.
    const response = await axiosInstance.get<Array<{ year: number }>>('/teams/seasons');
    return response.data.map((s) => s.year).sort((a, b) => b - a);
  },

  /**
   * Generate a new team join code (coaches only)
   */
  async generateJoinCode(): Promise<JoinCodeResponse> {
    const response = await axiosInstance.post<JoinCodeResponse>('/team/generate-join-code');
    return response.data;
  },

  /**
   * Join a team using a join code
   */
  async joinTeam(joinCode: string): Promise<JoinTeamResponse> {
    const response = await axiosInstance.post<JoinTeamResponse>('/team/join', { joinCode });
    return response.data;
  },

  /**
   * Request to claim an athlete profile
   */
  async claimProfile(athleteId: string): Promise<ClaimProfileResponse> {
    const response = await axiosInstance.post<ClaimProfileResponse>('/team/claim-profile', { athleteId });
    return response.data;
  },

  /**
   * Approve or reject a profile claim (coaches only)
   */
  async approveClaim(claimId: string, action: 'approve' | 'reject'): Promise<{ msg: string }> {
    const response = await axiosInstance.post<{ msg: string }>('/team/approve-claim', { claimId, action });
    return response.data;
  },

  /**
   * Get pending profile claims for coach review
   */
  async getPendingClaims(): Promise<{ pendingClaims: PendingClaim[] }> {
    const response = await axiosInstance.get<{ pendingClaims: PendingClaim[] }>('/team/pending-claims');
    return response.data;
  },

  /**
   * Coaching staff (HEAD_COACH/COACH/VOLUNTEER_COACH), pending invites, and
   * everyone else on the team.
   *
   * otherMembers exists for one specific repair: joining with the TEAM CODE
   * always creates an ATHLETE membership, so a coach handed the code
   * instead of a staff invite ends up an athlete at the team level and sees
   * a reduced menu. They belong in this list so someone can promote them.
   */
  async getStaff(): Promise<{
    staff: Array<{ userId: string; name: string | null; email: string; role: string; active: boolean }>;
    otherMembers: Array<{ userId: string; name: string | null; email: string; role: string; active: boolean }>;
    pendingInvites: Array<{ email: string; role: string; expiresAt: string }>;
  }> {
    const response = await axiosInstance.get('/team/staff');
    return response.data;
  },

  /**
   * Head-coach-only: name an exact person (by email) and an exact role.
   * Resending an invite to the same email overwrites the pending one rather
   * than creating a duplicate. Returns the invite token so the caller can
   * build a shareable `/staff-invite/:token` link. The backend also tries to
   * email that link via eusend — `emailSent` reflects whether that succeeded
   * (false when EUSEND_API_KEY isn't configured or the send failed), so the
   * caller can fall back to a copy-link UI either way.
   */
  async sendStaffInvite(email: string, role: 'HEAD_COACH' | 'COACH' | 'VOLUNTEER_COACH'): Promise<{
    msg: string;
    token: string;
    emailSent: boolean;
    invite: { token: string; email: string; role: string; expiresAt: string };
  }> {
    const response = await axiosInstance.post('/team/staff-invite', { email, role });
    return response.data;
  },

  /** Head-coach-only: change an existing staff member's role, or deactivate them. */
  async updateStaffMember(
    userId: string,
    updates: { role?: 'HEAD_COACH' | 'COACH' | 'VOLUNTEER_COACH'; active?: boolean }
  ): Promise<{ userId: string; role: string; active: boolean }> {
    const response = await axiosInstance.patch(`/team/staff/${userId}`, updates);
    return response.data;
  },
};
