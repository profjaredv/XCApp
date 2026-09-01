import api from './api';

export interface AdminTeamSummary {
  id: string;
  name: string;
  athleticTeamId: string;
  currentSeason: number | null;
  athleteCount: number;
}

export interface AdminOverview {
  totals: { teams: number; users: number; athletes: number; results: number; trainingLogs: number };
  pendingRequests: number;
  recent: { newUsersWeek: number; newTeamsMonth: number; activeTeamsWeek: number; paidTeams: number };
}

export interface AdminActivityEvent {
  kind: 'team_created' | 'team_requested' | 'race_added';
  at: string;
  title: string;
  detail: string;
}

export interface AdminUsage {
  days: number;
  total: number;
  /** Route with every id segment collapsed — "/t/:id/roster". */
  routes: Array<{ route: string; views: number }>;
  roles: Array<{ role: string; views: number }>;
  daily: Array<{ day: string; views: number }>;
}

export interface TeamRequest {
  id: string;
  email: string;
  name: string | null;
  message: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  resolvedAt: string | null;
  createdTeamId: string | null;
  adminNote: string | null;
  user?: { name: string | null; email: string };
}

export interface ApproveResult {
  team: { id: string; name: string; athleticTeamId: string; joinCode: string };
  claimLink: string;
  emailSent: boolean;
}

export const adminService = {
  /** Super-admin-only — every team on the platform, for the team switcher. */
  async listTeams(): Promise<AdminTeamSummary[]> {
    const response = await api.get<AdminTeamSummary[]>('/admin/teams');
    return response.data;
  },

  async overview(): Promise<AdminOverview> {
    const response = await api.get<AdminOverview>('/admin/overview');
    return response.data;
  },

  async activity(): Promise<AdminActivityEvent[]> {
    const response = await api.get<AdminActivityEvent[]>('/admin/activity');
    return response.data;
  },

  async usage(days = 30): Promise<AdminUsage> {
    const response = await api.get<AdminUsage>('/admin/usage', { params: { days } });
    return response.data;
  },

  async teamRequests(status?: 'pending' | 'approved' | 'declined'): Promise<TeamRequest[]> {
    const response = await api.get<TeamRequest[]>('/admin/team-requests', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  /** Creates the team, its join code and its claim, and emails the coach
   *  the setup link — all from approving the request. */
  async approveRequest(
    id: string,
    input: { name: string; athleticTeamId: string; email: string }
  ): Promise<ApproveResult> {
    const response = await api.post<ApproveResult>(`/admin/team-requests/${id}/approve`, input);
    return response.data;
  },

  async declineRequest(id: string, note?: string): Promise<TeamRequest> {
    const response = await api.post<TeamRequest>(`/admin/team-requests/${id}/decline`, { note });
    return response.data;
  },

  /** Create a team directly, with no request behind it. */
  async createTeam(input: { name: string; athleticTeamId: string; email: string }): Promise<ApproveResult> {
    const response = await api.post<ApproveResult>('/admin/teams', input);
    return response.data;
  },
};
