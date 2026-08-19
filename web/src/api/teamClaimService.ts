import { axiosInstance } from './axios';

export interface TeamClaimPreview {
  teamName: string;
  maskedEmail: string;
}

export const teamClaimService = {
  /** Public — no auth required. Shows "Claiming for X High School" before sign-in. */
  async getClaim(token: string): Promise<TeamClaimPreview> {
    const response = await axiosInstance.get<TeamClaimPreview>(`/team-claims/${token}`);
    return response.data;
  },
};
