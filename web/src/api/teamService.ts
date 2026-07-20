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
      params: { season: seasonYear || new Date().getFullYear() }
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
      params: { season: seasonYear || new Date().getFullYear() }
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
    const response = await axiosInstance.get<number[]>('/teams/seasons');
    return response.data.sort((a, b) => b - a); // Sort descending (newest first)
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
  }
};
