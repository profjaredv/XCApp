import api from './api';

export interface AdminTeamSummary {
  id: string;
  name: string;
  athleticTeamId: string;
  currentSeason: number | null;
  athleteCount: number;
}

export const adminService = {
  /** Super-admin-only — every team on the platform, for the team switcher. */
  async listTeams(): Promise<AdminTeamSummary[]> {
    const response = await api.get<AdminTeamSummary[]>('/admin/teams');
    return response.data;
  },
};
