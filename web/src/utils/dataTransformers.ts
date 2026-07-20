import { 
  ApiAthlete, 
  ApiRace, 
  ApiMeet,
  Race, 
  Athlete, 
  AthleteSeasonData,
  Meet
} from '../types/analytics';
import type { TeamData } from '../types/team';

/**
 * Transforms race data from API to frontend format
 */
interface ApiRaceOptional extends ApiRace {
  distanceMeters?: number;
  _id?: string;
  id?: string;
}

const transformRace = (raceIn: ApiRace): Race => {
  const race = raceIn as ApiRaceOptional;
  // Support either 'distance' (m) or 'distanceMeters' from backend
  const distanceMeters = (typeof race.distance === 'number' ? race.distance : undefined) ?? race.distanceMeters ?? 0;
  const timeSec = typeof race.time === 'number' ? race.time : 0;
  const computedPace = distanceMeters > 0 ? timeSec / (distanceMeters / 1609.34) : 0;
  const pace = typeof race.pace === 'number' && race.pace > 0 ? race.pace : computedPace;
  const id = (race._id || race.id || '') as string;
  return {
    id,
    name: race.name,
    date: race.date,
    distance: distanceMeters,
    time: timeSec,
    pace,
    course: race.course || '',
    conditions: race.conditions || '',
    place: race.place || 0,
    teamPlace: race.teamPlace || 0,
    pr: race.pr || false,
    seasonBest: race.seasonBest || false
  };
};

/**
 * Transforms raw athlete data from API to match our frontend interface
 */
export const transformAthlete = (apiAthlete: ApiAthlete, seasonYear?: number): Athlete => {
  // Extract first and last name from the name field
  const nameParts = apiAthlete.name.split(' ');
  const lastName = nameParts.pop() || '';
  const firstName = nameParts.join(' ');
  
  // Transform races
  const races = (apiAthlete.races || []).map(transformRace);
  const season = seasonYear ?? new Date().getFullYear();

  // Compute grade based on graduationYear when available, else fall back
  // Graduation year may be present on some backends; keep internal-only variable
  const grad = (apiAthlete as unknown as { graduationYear?: number }).graduationYear;
  const computedGrade = typeof grad === 'number' && Number.isFinite(grad)
    ? Math.max(6, Math.min(12, 13 - (grad - season)))
    : apiAthlete.grade;
  
  // Create current season
  const currentSeason: AthleteSeasonData = {
    year: season,
    grade: computedGrade,
    races,
    totalRaces: apiAthlete.raceCount || 0,
    bestTime: apiAthlete.bestTime || 0,
    bestRace: null,
    avgPace: apiAthlete.avgPace || 0,
    improvementPercent: apiAthlete.improvementPercent || 0,
    teamRank: 0,
    stateRank: 0,
    prs: 0,
    seasonBests: 0
  };

  // Calculate best race and stats if not provided
  if (races.length > 0) {
    const validRaces = races.filter(race => race.time > 0);
    if (validRaces.length > 0) {
      const bestRace = [...validRaces].sort((a, b) => a.time - b.time)[0];
      currentSeason.bestRace = bestRace;
      
      if (!currentSeason.bestTime) {
        currentSeason.bestTime = bestRace.time;
      }
      
      if (!currentSeason.avgPace) {
        const totalPace = validRaces.reduce((sum, race) => sum + race.pace, 0);
        currentSeason.avgPace = totalPace / validRaces.length;
      }
    }
  }

  // Normalize gender values from backend variations
  const genderRaw = (apiAthlete.gender || '').toString().toLowerCase();
  let transformedGender: 'M' | 'F';
  if (['men', 'male', 'm', 'boys', 'boy'].includes(genderRaw)) {
    transformedGender = 'M';
  } else if (['women', 'female', 'f', 'girls', 'girl', 'w'].includes(genderRaw)) {
    transformedGender = 'F';
  } else {
    console.warn(`Unexpected gender value: "${apiAthlete.gender}" for athlete ${apiAthlete.name}; defaulting to 'F'.`);
    transformedGender = 'F';
  }

  return {
    id: apiAthlete.id || apiAthlete._id || '',
    name: apiAthlete.name,
    firstName,
    lastName,
    currentGrade: computedGrade,
    gender: transformedGender,
    teamName: apiAthlete.team?.name || 'Unknown Team',
    seasons: [currentSeason],
    currentSeason,
    personalBests: {},
    races,
    bestTime: currentSeason.bestTime,
    avgPace: currentSeason.avgPace,
    improvementPercent: currentSeason.improvementPercent,
    raceCount: currentSeason.totalRaces,
    firstRaceTime: (apiAthlete as unknown as { firstRaceTime?: number }).firstRaceTime || 0,
    lastRaceTime: (apiAthlete as unknown as { lastRaceTime?: number }).lastRaceTime || 0,
    bestTimeDate: (apiAthlete as unknown as { bestTimeDate?: string }).bestTimeDate || ''
  };
};

/**
 * Transforms meet data from API to frontend format
 */
export const transformMeet = (meet: ApiMeet): Meet => {
  const id = meet._id || meet.id || '';
  return {
    id: String(id), // Ensure id is always a string
    name: meet.name,
    date: meet.date,
    location: meet.location || '',
    distance: meet.distance,
    avgPace: meet.avgPace || 0,
    runners: meet.runners || 0,
    conditions: meet.conditions,
    results: meet.results || []
  };
};

/**
 * Transforms team performance data from API to frontend format
 */
export const transformTeamPerformance = (teamData: {
  id?: string;
  name?: string;
  totalRaces?: number;
  totalMiles?: number;
  avgMilePace?: number;
  improvementPercent?: number;
  firstMeet?: { name: string; date: string; avgPace: number };
  lastMeet?: { name: string; date: string; avgPace: number };
}): TeamData => {
  const baseTeam = {
    id: teamData.id || '',
    name: teamData.name || 'Team',
    totalRaces: teamData.totalRaces || 0,
    totalMiles: teamData.totalMiles || 0,
    avgMilePace: teamData.avgMilePace || 0,
    improvementPercent: teamData.improvementPercent || 0,
    firstMeet: teamData.firstMeet || { name: '', date: '', avgPace: 0 },
    lastMeet: teamData.lastMeet || { name: '', date: '', avgPace: 0 }
  };
  
  return {
    overview: { ...baseTeam },
    men: { ...baseTeam },
    women: { ...baseTeam }
  };
};

