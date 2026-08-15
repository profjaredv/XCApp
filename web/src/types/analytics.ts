// Base interfaces for the API response
export interface ApiRace {
  _id?: string;
  id?: string;
  name: string;
  date: string;
  distance: number; // in meters
  time: number; // in seconds
  pace?: number; // in seconds per mile
  course?: string;
  conditions?: string;
  place?: number;
  teamPlace?: number;
  pr?: boolean;
  seasonBest?: boolean;
}

export interface ApiMeet {
  _id: string;
  id?: string;
  name: string;
  date: string;
  location?: string;
  distance: number;
  avgPace?: number;
  runners?: number;
  conditions?: string;
  // Total FINISHED count in this race's uploaded field-results — the
  // denominator for `results[].place` ("place of fieldFinisherCount").
  // Null/undefined until a field-results upload exists for this race.
  fieldFinisherCount?: number | null;
  results?: Array<{
    athleteId: string;
    time: number;
    place: number;
    // The division/heat text this athlete actually ran, matched from a
    // field-results upload — see the Result.division schema comment.
    division?: string | null;
    // Combined rank across every division on this race sharing this
    // athlete's gender (Boys Varsity Gold/Silver/Bronze, etc.), out of
    // overallFieldSize — see the Result.overallPlace schema comment. Only
    // present when the meet actually split this event into 2+ such
    // divisions.
    overallPlace?: number | null;
    overallFieldSize?: number | null;
    // Rank among just our own team's same-gender finishers in this race —
    // always available, no field-results upload needed. See lib/
    // teamPlace.js. Distinct from `place` above, never conflate the two.
    teamPlace?: number | null;
    pr: boolean;
    seasonBest: boolean;
  }>;
}

export interface ApiAthlete {
  _id: string;
  id?: string;
  name: string;
  grade: number;
  gender: 'Men' | 'Women' | 'M' | 'F';
  team?: {
    _id: string;
    name: string;
  };
  races?: ApiRace[];
  raceCount?: number;
  bestTime?: number;
  avgPace?: number;
  improvementPercent?: number;
  bestTimeDate?: string;
  firstRaceTime?: number;
  lastRaceTime?: number;
}

// Frontend interfaces
export interface Race {
  id: string;
  name: string;
  date: string;
  distance: number;
  time: number;
  pace: number;
  course: string;
  conditions: string;
  place: number;
  teamPlace: number;
  pr: boolean;
  seasonBest: boolean;
}

export interface AthleteSeasonData {
  year: number;
  grade: number;
  races: Race[];
  totalRaces: number;
  bestTime: number;
  bestRace: Race | null;
  avgPace: number;
  improvementPercent: number;
  teamRank?: number;
  stateRank?: number;
  prs?: number;
  seasonBests?: number;
}

export interface Athlete {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  currentGrade: number;
  gender: 'M' | 'F';
  teamName: string;
  seasons: AthleteSeasonData[];
  currentSeason: AthleteSeasonData;
  personalBests: Record<string, number>;
  races: Race[];
  bestTime: number; // Season best 5K
  prBest5K?: number; // Personal record 5K (all-time best)
  avgPace: number;
  improvementPercent: number;
  raceCount: number;
  firstRaceTime: number;
  lastRaceTime: number;
  bestTimeDate: string;
}

export interface TeamPerformance {
  name?: string;
  totalMeets?: number;
  totalRaces?: number;
  totalAthletes?: number;
  avgAthletesPerRace?: number;
  totalMilesRun?: number;
  totalMiles?: number; // Keep for backward compatibility
  avgMilePace?: number;
  improvementPercent?: number;
  meetCount?: number;
  totalRunners?: number;
  totalPRs?: number;
  top10Finishes?: number;
  firstMeet?: {
    name: string;
    date: string;
    avgPace: number;
  };
  lastMeet?: {
    name: string;
    date: string;
    avgPace: number;
  };
}

export interface RaceResult {
  id?: string;
  athleteId: string;
  name?: string;
  time: number;
  // FIELD data (see backend lib/fieldPlacement.js) — place within this
  // athlete's own division's field, null until a field-results upload
  // exists for this race. Distinct from teamPlace below — never conflate
  // the two, see lib/teamPlace.js's comment for why that used to happen.
  place: number | null;
  division?: string | null;
  overallPlace?: number | null;
  overallFieldSize?: number | null;
  team?: string;
  grade?: number;
  pr?: boolean;
  seasonBest?: boolean;
  // ORIGIN data (see backend lib/teamPlace.js) — rank among just our own
  // team's same-gender finishers in this race. Always available, no field
  // upload needed.
  teamPlace?: number | null;
  pace?: number;
  distance?: number;
}

export interface Meet extends Omit<ApiMeet, '_id'> {
  id: string;
  location: string;
  avgPace: number;
  runners: number;
}

export interface MostImprovedAthlete {
  id: string;
  name: string;
  improvementPercent: number;
  currentGrade: number;
  gender: 'M' | 'F';
  teamName: string;
  bestTime: number;
  bestTimeDate: string;
  firstRaceTime?: number;
  lastRaceTime?: number;
}

export interface AnalyticsData {
  athletes: Athlete[];
  team: {
    overview: TeamPerformance;
    men: TeamPerformance;
    women: TeamPerformance;
  };
  mostImproved: MostImprovedAthlete[];
  meets: Meet[];
}
