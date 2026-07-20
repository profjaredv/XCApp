export interface PerformanceMetrics {
  _id?: string;
  teamId: string;
  season: number;
  updatedAt?: string;
  cached?: boolean;
}

export interface TeamPerformance extends PerformanceMetrics {
  metrics: {
    overall: PerformanceStats;
    byGender: {
      M: PerformanceStats;
      F: PerformanceStats;
      [key: string]: PerformanceStats;
    };
    byGrade: {
      [grade: string]: PerformanceStats;
    };
    improvementPercent?: number;
    firstMeet?: MeetReference;
    lastMeet?: MeetReference;
    totalMeets?: number;
  };
}

export interface AthletePerformance extends PerformanceMetrics {
  athleteId: string;
  athleteName: string;
  gender: 'M' | 'F';
  grade: number;
  metrics: {
    current: PerformanceStats;
    best: PerformanceStats;
    improvement: PerformanceStats;
    races: RacePerformance[];
  };
}

export interface MeetPerformance extends PerformanceMetrics {
  meetId: string;
  meetName: string;
  meetDate: string;
  metrics: {
    overall: PerformanceStats;
    byGender: {
      M: PerformanceStats;
      F: PerformanceStats;
      [key: string]: PerformanceStats;
    };
    byGrade: {
      [grade: string]: PerformanceStats;
    };
    seasonTrend: {
      paceTrend: number;
      timeTrend: number;
    };
  };
}

export interface PaceBreakdown {
  overall: number;
  first5k?: number;
  last5k?: number;
}

export interface PerformanceStats {
  avgMilePace: PaceBreakdown;
  avgTime?: number;
  bestTime?: number;
  bestPace?: number;
  totalRaces: number;
  totalMiles: number;
  prCount?: number;
  top10Count?: number;
  top25PercentCount?: number;
  personalBestCount?: number;
  teamBestTime?: number;
  athleteCount?: number;
}

export interface RacePerformance {
  meetId: string;
  meetName: string;
  date: string;
  distance: number;
  time: number;
  pace: number;
  place: number;
  totalRunners: number;
  isPr: boolean;
  isSeasonBest: boolean;
}

interface MeetReference {
  name: string;
  date: string;
  avgPace: number;
  avgTime: number;
}

// Response types for API calls
export interface PerformanceResponse<T> {
  success: boolean;
  data: T;
  cached?: boolean;
  message?: string;
  error?: string;
}

export type TeamPerformanceResponse = PerformanceResponse<TeamPerformance>;
export type AthletePerformanceResponse = PerformanceResponse<AthletePerformance>;
export type MeetPerformanceResponse = PerformanceResponse<MeetPerformance>;

// Season series types
export interface TeamSeasonSeriesPoint {
  meetId: string | null;
  meetName?: string;
  meetDate: string;
  overall: {
    totalRaces: number;
    totalMiles: number;
    avgMilePace: PaceBreakdown;
    teamBestTime: number;
  };
  byGender: {
    M?: PerformanceStats | null;
    F?: PerformanceStats | null;
    [key: string]: PerformanceStats | null | undefined;
  };
  deltaVsPrevious: number; // % improvement vs previous meet (positive is faster)
}

export type TeamSeasonSeriesResponse = PerformanceResponse<{
  series: TeamSeasonSeriesPoint[];
  trend: { slope: number; percentChange: number };
}>;
