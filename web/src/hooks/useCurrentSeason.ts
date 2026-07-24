import { useTeamContext } from './useTeamContext';
import { currentCalendarSeason } from '@/lib/seasonUtils';

/**
 * The season the app should treat as "now".
 *
 * Resolution order (server-side, via /teams/context): explicit team setting >
 * active season row > most recent season the team actually has data for.
 *
 * The old implementation fell straight through to `new Date().getFullYear()`,
 * which is what put a team whose latest data was 2025 on an empty 2026. The
 * remaining local fallback only covers the brief window before context loads,
 * and is season-aware (a fall sport's season doesn't start in January).
 */
export function useCurrentSeason(): number {
  const { data } = useTeamContext();
  return data?.activeSeason ?? currentCalendarSeason();
}
