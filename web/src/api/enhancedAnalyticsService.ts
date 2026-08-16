import api from './api';

export interface EnhancedAthleteMetrics {
  athleteId: string;
  athleteName: string;
  teamId: string;
  season: number;
  grade?: number;
  gender?: 'Men' | 'Women';
  
  // Basic metrics
  totalRaces: number;
  totalMiles: number;
  avgMilePace: {
    overall: number;
  };
  bestTime: number;
  worstTime: number;
  
  // Distance-specific performance
  byDistance: {
    oneMile: DistanceMetrics;
    onePointFiveMile: DistanceMetrics;
    threeMile: DistanceMetrics;
    fiveK: DistanceMetrics;
    other: {
      count: number;
      avgTime: number;
      avgPace: number;
      totalMiles: number;
    };
  };

  // Season progression
  seasonProgression: {
    earlySeasonAvg: number;
    lateSeasonAvg: number;
    improvementRate: number;
    peakPerformanceRace: number;
    consistencyTrend: number;
  };

  // Placement analysis
  placement: {
    avgPlace: number;
    bestPlace: number;
    worstPlace: number;
    placementTrend: number;
    top10Finishes: number;
    top25Finishes: number;
  };

  // Course performance
  coursePerformance: CoursePerformance[];

  // Race comparisons
  raceComparisons: RaceComparison[];
}

export interface DistanceMetrics {
  count: number;
  bestTime: number;
  worstTime: number;
  avgTime: number;
  avgPace: number;
  consistency: number;
  totalMiles: number;
}

export interface CoursePerformance {
  courseName: string;
  raceCount: number;
  avgTime: number;
  bestTime: number;
  improvementOnCourse: number;
}

export interface RaceComparison {
  meetName: string;
  seasons: {
    season: number;
    raceDate: string;
    athleteCount: number;
    avgTime: number;
    bestTime: number;
    avgPlace: number;
    timeImprovement?: number;
    placeImprovement?: number;
  }[];
}

export interface EnhancedTeamMetrics {
  teamId: string;
  season: number;
  totalAthletes: number;
  totalRaces: number;
  totalMiles: number;
  avgMilePace: {
    overall: number;
  };

  // Gender breakdown
  byGender: {
    men: GenderMetrics;
    women: GenderMetrics;
  };
  
  // Grade breakdown
  byGrade: {
    grade9: GradeMetrics;
    grade10: GradeMetrics;
    grade11: GradeMetrics;
    grade12: GradeMetrics;
  };

  // Grade breakdown split by gender — boys and girls paces shouldn't be
  // averaged together within a grade.
  byGradeGender: {
    grade9: { M: GradeMetrics; F: GradeMetrics };
    grade10: { M: GradeMetrics; F: GradeMetrics };
    grade11: { M: GradeMetrics; F: GradeMetrics };
    grade12: { M: GradeMetrics; F: GradeMetrics };
  };

  // Distance-specific team analysis
  byDistance: {
    oneMile: TeamDistanceMetrics;
    onePointFiveMile: TeamDistanceMetrics;
    threeMile: TeamDistanceMetrics;
    fiveK: TeamDistanceMetrics;
  };
  
  // Team depth analysis
  teamDepth: {
    top5Spread: number;
    top7Spread: number;
    depthScore: number;
  };
  
  // Pack running analysis
  packRunning: {
    avgGapBetweenRunners: number;
    packTightness: number;
    packConsistency: number;
  };

  // Team scoring / field-standing — from field-results uploads (see
  // backend lib/meetScoring.js). Split by gender: a boys and girls
  // division are always scored separately (never blended into one team),
  // so this aggregate keeps that split rather than averaging them back
  // together. Null fields when no race this season has field-results data
  // yet for that gender.
  fieldStanding: {
    men: FieldStandingStats;
    women: FieldStandingStats;
  };
}

export interface FieldStandingStats {
  avgTeamScore: number | null;
  scoredDivisionCount: number;
  top20Percent: number | null;
  top50Percent: number | null;
  totalWithFieldData: number;
}

export interface GenderMetrics {
  count: number;
  avgPace: number;
  bestTime: number;
}

export interface GradeMetrics {
  count: number;
  avgPace: number;
  bestTime: number;
}

export interface TeamDistanceMetrics {
  athleteCount: number;
  avgTime: number;
  bestTime: number;
  avgPace: number;
}

export interface DistanceAnalysis {
  team: {
    oneMile?: TeamDistanceMetrics;
    onePointFiveMile?: TeamDistanceMetrics;
    threeMile?: TeamDistanceMetrics;
    fiveK?: TeamDistanceMetrics;
  };
  athletes: {
    athleteId: string;
    athleteName: string;
    byDistance: EnhancedAthleteMetrics['byDistance'];
  }[];
}

/**
 * Service for enhanced analytics operations
 */
export const enhancedAnalyticsService = {
  /**
   * Get enhanced team metrics for a specific season
   */
  getEnhancedTeamMetrics: async (teamId: string, season: string): Promise<EnhancedTeamMetrics> => {
    // teamId kept for call-site compatibility; the backend derives team
    // from the authenticated session, not the URL.
    void teamId;
    const response = await api.get<{ success: boolean; data: EnhancedTeamMetrics }>(`/enhanced-performance/team/${season}`);
    return response.data.data;
  },

  /**
   * Get enhanced athlete metrics for a specific season
   */
  getEnhancedAthleteMetrics: async (athleteId: string, season: string): Promise<EnhancedAthleteMetrics> => {
    const response = await api.get<{ success: boolean; data: EnhancedAthleteMetrics }>(`/enhanced-performance/athlete/${athleteId}/${season}`);
    return response.data.data;
  },

  /**
   * Get distance-specific analysis for a team and season
   */
  getDistanceAnalysis: async (teamId: string, season: string): Promise<DistanceAnalysis> => {
    void teamId;
    const response = await api.get<{ success: boolean; data: DistanceAnalysis }>(`/enhanced-performance/distance-analysis/${season}`);
    return response.data.data;
  },

  /**
   * Get season-over-season race comparisons for an athlete
   */
  getRaceComparisons: async (athleteId: string): Promise<RaceComparison[]> => {
    const response = await api.get<{ success: boolean; data: RaceComparison[] }>(`/enhanced-performance/race-comparisons/${athleteId}`);
    return response.data.data;
  }
};

export default enhancedAnalyticsService;
