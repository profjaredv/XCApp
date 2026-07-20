/**
 * PR (Personal Record) Tracking Utilities
 * 
 * Tracks athlete PRs across all seasons for each distance.
 * PRs are historical - once set, they remain marked even if the athlete runs slower later.
 */

export interface RaceWithPR {
  time: number;
  distanceMeters: number;
  date: string;
  meetName: string;
  isPR: boolean;
  prType?: 'overall' | 'season'; // overall PR across all time, or season PR
}

/**
 * Normalize distance to handle slight variations
 * Groups distances within 50m of each other
 */
export function normalizeDistance(distanceMeters: number): number {
  const commonDistances = [
    1600,   // Mile
    3000,   // 3K
    3200,   // 2 Mile
    5000,   // 5K
    8000,   // 8K
  ];
  
  // Find closest common distance within 50m
  for (const common of commonDistances) {
    if (Math.abs(distanceMeters - common) <= 50) {
      return common;
    }
  }
  
  // Return original if no match
  return distanceMeters;
}

/**
 * Calculate PRs for an athlete across all their races
 * Returns a Set of race identifiers that are PRs
 */
export function calculatePRs(races: Array<{
  time: number;
  distanceMeters: number;
  date: string;
  meetName: string;
  _id?: string;
}>): Set<string> {
  if (!races || races.length === 0) return new Set();
  
  // Sort races by date (oldest first) to track PRs chronologically
  const sortedRaces = [...races].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Track best time for each distance
  const bestTimesByDistance = new Map<number, number>();
  const prSet = new Set<string>();
  
  sortedRaces.forEach((race, index) => {
    const normalizedDistance = normalizeDistance(race.distanceMeters);
    const currentBest = bestTimesByDistance.get(normalizedDistance);
    
    // If this is the first race at this distance, or if it's faster than the current best
    if (currentBest === undefined || race.time < currentBest) {
      bestTimesByDistance.set(normalizedDistance, race.time);
      // Create unique identifier for this race
      const raceId = race._id || `${race.meetName}-${race.date}-${index}`;
      prSet.add(raceId);
    }
  });
  
  return prSet;
}

/**
 * Calculate season PRs (best time in a specific season for each distance)
 */
export function calculateSeasonPRs(
  races: Array<{
    time: number;
    distanceMeters: number;
    date: string;
    meetName: string;
    season: number;
    _id?: string;
  }>,
  season: number
): Set<string> {
  const seasonRaces = races.filter(r => r.season === season);
  return calculatePRs(seasonRaces);
}

/**
 * Enrich races with PR information
 */
export function enrichRacesWithPRs<T extends {
  time: number;
  distanceMeters: number;
  date: string;
  meetName: string;
  season?: number;
  _id?: string;
}>(races: T[]): Array<T & { isPR: boolean; isSeasonPR?: boolean }> {
  const overallPRs = calculatePRs(races);
  
  return races.map((race, index) => {
    const raceId = race._id || `${race.meetName}-${race.date}-${index}`;
    const isPR = overallPRs.has(raceId);
    
    // Calculate season PR if season is available
    let isSeasonPR = false;
    if (race.season !== undefined) {
      const seasonPRs = calculateSeasonPRs(races as any, race.season);
      isSeasonPR = seasonPRs.has(raceId) && !isPR; // Only mark as season PR if not overall PR
    }
    
    return {
      ...race,
      isPR,
      isSeasonPR
    };
  });
}

/**
 * Get PR badge component props
 */
export function getPRBadgeStyle(isPR: boolean, isSeasonPR: boolean = false): {
  className: string;
  label: string;
} {
  if (isPR) {
    return {
      className: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 font-bold',
      label: 'PR'
    };
  }
  if (isSeasonPR) {
    return {
      className: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-semibold',
      label: 'SB'
    };
  }
  return {
    className: '',
    label: ''
  };
}

/**
 * Format distance for display
 */
export function formatDistance(distanceMeters: number): string {
  const normalized = normalizeDistance(distanceMeters);
  
  switch (normalized) {
    case 1600:
      return '1 Mile';
    case 3000:
      return '3K';
    case 3200:
      return '2 Mile';
    case 5000:
      return '5K';
    case 8000:
      return '8K';
    default:
      return `${(distanceMeters / 1000).toFixed(2)}K`;
  }
}
