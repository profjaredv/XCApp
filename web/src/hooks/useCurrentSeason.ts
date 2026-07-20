import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to get the current season from team settings
 * Falls back to current calendar year if not set
 */
export function useCurrentSeason(): number {
  const { currentUser } = useAuth();
  
  // Use team's current_season if available, otherwise fall back to current year
  return currentUser?.team?.current_season || currentUser?.team?.currentSeason || new Date().getFullYear();
}
