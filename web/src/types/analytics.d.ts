declare module '@/types/analytics' {
  export interface Race {
    id: string;
    name: string;
    date: string;
    distance: number; // in meters
    time: number; // in seconds
    pace: number; // in seconds per mile
    course: string;
    conditions: string;
    elevation: number;
    place: number;
    teamPlace: number;
    pr: boolean;
  }

  export interface Athlete {
    id: string;
    name: string;
    grade: number;
    gender: 'M' | 'F';
    teamName: string;
    races: Race[];
    totalRaces: number;
    bestTime: number; // in seconds
    bestRace: Race;
    avgPace: number; // in seconds per mile
    improvementPercent: number;
    personalBests: Record<string, number>; // distance -> time in seconds
  }

  export interface TeamPerformance {
    totalRaces: number;
    totalMiles: number;
    avgMilePace: number; // in seconds per mile
    improvementPercent: number;
    firstMeet: {
      name: string;
      date: string;
      avgPace: number;
    };
    lastMeet: {
      name: string;
      date: string;
      avgPace: number;
    };
  }

  export interface MostImprovedAthlete {
    athleteId: string;
    improvement: number; // in seconds
  }

  export interface Meet {
    id: string;
    name: string;
    date: string;
    distance: number;
    avgPace: number;
    runners: number;
  }

  export interface AnalyticsData {
    athletes: Athlete[];
    team: {
      overview: TeamPerformance;
      men: TeamPerformance;
      women: TeamPerformance;
    };
    overview: TeamPerformance;
    men: TeamPerformance;
    women: TeamPerformance;
    mostImproved: MostImprovedAthlete[];
    meets: Meet[];
  }
}
