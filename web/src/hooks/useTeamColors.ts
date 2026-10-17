import { useQuery } from '@tanstack/react-query';
import api from '@/api/api';
import { useAuth } from '@/contexts/AuthContext';
import { exportPalette, type ExportPalette, type TeamColors } from '@/lib/teamColors';

export interface TeamColorsResponse {
  colors: TeamColors;
}

/** The signed-in team's colors. `enabled` is false for signed-out visitors, who have no team. */
export function useTeamColors(enabled = true) {
  const { currentUser } = useAuth();
  return useQuery<TeamColorsResponse>({
    // Keyed by team so an admin stepping into another team never sees the last team's colors.
    queryKey: ['teamColors', currentUser?.team?.id ?? null],
    queryFn: async () => (await api.get<TeamColorsResponse>('/team/colors')).data,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** The team's export palette, or null to use the exporter's own defaults. */
export function useExportPalette(): ExportPalette | null {
  const { data } = useTeamColors();
  return exportPalette(data?.colors);
}
