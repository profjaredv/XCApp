import { axiosInstance } from './axios';

// Parent access: coach-side invites, and the parent's own side (accepting an
// invite, and following their runners). See backend/routes/team.js and
// backend/routes/guardian.js.

export interface ParentInvite {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  link: string;
  athletes: Array<{ id: string; name: string }>;
}

export interface ParentInvitePreview {
  teamName: string;
  status: 'pending' | 'accepted' | 'revoked';
  expired: boolean;
  /** Masked: "j***@example.com". */
  sentTo: string;
  emailMatches: boolean;
  /** Empty unless the signed-in email is the one the invite went to. */
  athletes: Array<{ id: string; name: string }>;
  athleteCount: number;
}

export interface GuardianLinkSummary {
  athleteId: string;
  athleteName: string;
  teamName: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  resolvedAt: string | null;
}

export interface GuardianRaceResult {
  id: string;
  time: number | null;
  place: number | null;
  status: string;
  race: { id: string; name: string; date: string; distance: string | null };
}

export interface GuardianAthlete {
  id: string;
  name: string;
  grade: number | null;
  season: number;
  results: GuardianRaceResult[];
}

export const parentService = {
  async listInvites(): Promise<ParentInvite[]> {
    return (await axiosInstance.get<ParentInvite[]>('/team/parent-invites')).data;
  },
  async invite(email: string, athleteIds: string[]): Promise<{ msg: string; emailSent: boolean; invite: ParentInvite }> {
    return (await axiosInstance.post('/team/parent-invites', { email, athleteIds })).data;
  },
  async cancelInvite(id: string): Promise<{ msg: string }> {
    return (await axiosInstance.delete(`/team/parent-invites/${id}`)).data;
  },
  async previewInvite(token: string): Promise<ParentInvitePreview> {
    return (await axiosInstance.get<ParentInvitePreview>(`/guardian/invites/${token}`)).data;
  },
  async acceptInvite(token: string): Promise<{ msg: string; linked: string[] }> {
    return (await axiosInstance.post(`/guardian/invites/${token}/accept`)).data;
  },
  async myLinks(): Promise<GuardianLinkSummary[]> {
    return (await axiosInstance.get<GuardianLinkSummary[]>('/guardian/my-links')).data;
  },
  async athlete(athleteId: string): Promise<GuardianAthlete> {
    return (await axiosInstance.get<GuardianAthlete>(`/guardian/athletes/${athleteId}`)).data;
  },
};

/** The link a coach shares with parents: opens the parent sign-up with the team's code filled in. */
export function parentJoinLink(joinCode: string): string {
  return `${window.location.origin}/parents/${encodeURIComponent(joinCode)}`;
}
