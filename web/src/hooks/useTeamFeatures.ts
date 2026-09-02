import { useQuery } from '@tanstack/react-query';
import api from '@/api/api';
import type { TeamFeatureKey } from '@/lib/teamFeatureKeys';

// Which optional parts of the app this team turned on (backend catalog in
// lib/teamFeatures.js — the list lives there, not here, so the screen that
// renders the switches and the middleware that enforces them can't drift
// apart).
//
// Everything defaults ON while this is loading or if the request fails.
// The failure mode matters: a team that HAS attendance briefly losing its
// Attendance button is a flicker, but a team that never turned anything
// off finding half their app missing because one request 500'd is the app
// looking broken.

export type { TeamFeatureKey };

export interface TeamFeature {
  key: TeamFeatureKey;
  label: string;
  description: string;
  default: boolean;
  enabled: boolean;
}

export interface TeamFeaturesResponse {
  features: TeamFeature[];
  enabled: Record<TeamFeatureKey, boolean>;
}

export function useTeamFeatures() {
  return useQuery<TeamFeaturesResponse>({
    queryKey: ['teamFeatures'],
    queryFn: async () => {
      const response = await api.get<TeamFeaturesResponse>('/team/features');
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Is one feature on? Optimistic while loading, for the reason above. */
export function useFeatureEnabled(key: TeamFeatureKey): boolean {
  const { data } = useTeamFeatures();
  const value = data?.enabled?.[key];
  return typeof value === 'boolean' ? value : true;
}
