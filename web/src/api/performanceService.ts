import { axiosInstance } from './axios';
import {
  TeamPerformanceResponse,
  AthletePerformanceResponse,
  MeetPerformanceResponse,
  TeamSeasonSeriesResponse,
  PerformanceResponse
} from '../types/performance';

// Define type for athlete season metrics
export interface AthleteSeasonMetricsData {
  // GET /performance/athlete/:id/all-seasons spreads the raw Prisma
  // AthleteSeasonMetrics row, so these are the fields that are ACTUALLY
  // present — flat camelCase, matching prisma/schema.prisma, never
  // snake_case. The snake_case fields below never appear on a live response;
  // they're kept only because other, unaudited call sites may still read
  // them defensively.
  athleteId?: string;
  teamId?: string;
  season: number;
  grade?: number | string;
  gender?: string;
  totalRaces?: number;
  totalMiles?: number;
  averagePace?: number;
  bestPace?: number;
  bestTime5k?: number;
  improvementPercent?: number;
  totalTimeDropped?: number;

  // Legacy snake_case — not returned by the current backend, retained only
  // as a defensive fallback for older cached responses.
  athlete_id?: string;
  team_id?: string;
  total_races?: number;
  total_miles?: number;
  average_pace?: number;
  best_time_5k?: number;
  improvement_percent?: number;
  total_time_dropped?: number;
  
  // Optional nested metrics object (legacy)
  metrics?: {
    totalRaces: number;
    totalMiles: number;
    avgMilePace: {
      overall: number;
      first5k: number;
      last5k: number;
    };
    bestTime: number;
    best5kTime?: number;
    improvementPercent: number;
    totalTimeDropped: number;
  };
  
  // Races are returned at the top level, not nested in metrics
  races?: Array<{
    _id?: string;
    time: number;
    distanceMeters: number;
    distanceText?: string;
    meetName: string;
    date: string;
    season: number;
    distance?: number; // distance in miles
  }>;
  
  // Also at top level (duplicate for compatibility)
  best5kTime?: number;
}

interface PerformanceService {
  getTeamMetrics(teamId: string, season: number): Promise<TeamPerformanceResponse>;
  getAthleteMetrics(athleteId: string, season: number): Promise<AthletePerformanceResponse>;
  getAthleteAllSeasons(athleteId: string): Promise<PerformanceResponse<{ athleteId: string, seasons: AthleteSeasonMetricsData[] }>>;
  getMeetMetrics(meetId: string, teamId: string): Promise<MeetPerformanceResponse>;
  getTeamSeasonSeries(teamId: string, season: number): Promise<TeamSeasonSeriesResponse>;
  recalculateMetrics(teamId: string, season: number): Promise<PerformanceResponse<{ success: boolean }>>;
  clearCache(
    scope: 'all' | 'team' | 'athlete' | 'meet', 
    ids?: { teamId?: string; athleteId?: string; season?: number }
  ): Promise<PerformanceResponse<{ clearedCount: number }>>;
}

export const performanceService: PerformanceService = {
  async getTeamMetrics(teamId: string, season: number) {
    // teamId kept for call-site compatibility; the backend derives team
    // from the authenticated session, not the URL.
    void teamId;
    const response = await axiosInstance.get<TeamPerformanceResponse>(
      `/performance/team/season/${season}`
    );
    return response.data;
  },

  async getAthleteMetrics(athleteId: string, season: number) {
    const response = await axiosInstance.get<AthletePerformanceResponse>(
      `/performance/athlete/${athleteId}/season/${season}`
    );
    return response.data;
  },
  
  async getAthleteAllSeasons(athleteId: string) {
    const response = await axiosInstance.get<PerformanceResponse<{ athleteId: string, seasons: AthleteSeasonMetricsData[] }>>(
      `/performance/athlete/${athleteId}/all-seasons`
    );
    return response.data;
  },

  async getMeetMetrics(meetId: string, teamId: string) {
    // teamId kept for call-site compatibility; the backend derives team
    // from the authenticated session, not the URL.
    void teamId;
    const response = await axiosInstance.get<MeetPerformanceResponse>(
      `/performance/meet/${meetId}`
    );
    return response.data;
  },

  async getTeamSeasonSeries(teamId: string, season: number) {
    void teamId;
    const response = await axiosInstance.get<TeamSeasonSeriesResponse>(
      `/performance/team/season/${season}/series`
    );
    return response.data;
  },

  async recalculateMetrics(teamId: string, season: number) {
    void teamId;
    const response = await axiosInstance.post<PerformanceResponse<{ success: boolean }>>(
      `/performance/calculate/${season}`
    );
    return response.data;
  },

  async clearCache(
    scope: 'all' | 'team' | 'athlete' | 'meet' = 'all', 
    ids: { teamId?: string; athleteId?: string; season?: number } = {}
  ) {
    const response = await axiosInstance.post<PerformanceResponse<{ clearedCount: number }>>(
      '/performance/cache/clear', 
      { scope, ...ids }
    );
    return response.data;
  }
};

export default performanceService;
