import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/axios';

export interface BandStats {
  range: [number, number];
  athleteCount: number;
  raceCount: number;
  insufficientDepth: boolean;
  meanPaceSecPerMile?: number;
  medianPaceSecPerMile?: number;
  stdDevPaceSecPerMile?: number;
  meanFieldRatio?: number;
  medianFieldRatio?: number;
}

export interface BandPositionCurvePoint {
  position: number;
  avgTimeSec: number | null;
  raceCount: number;
}

export interface BandSeasonEntry {
  season: number;
  rosterSize: number;
  insufficientDepth: boolean;
  bands: { top: BandStats | null; middle: BandStats | null; bottom: BandStats | null } | null;
  positionCurve: BandPositionCurvePoint[];
}

export interface BandAnalyticsData {
  success: boolean;
  gender: 'M' | 'F';
  mode: 'meet' | 'season';
  courseId: string | null;
  courseName: string | null;
  boundaries: { topSize: number; bottomSize: number };
  normalizationAvailable: boolean;
  seasons: BandSeasonEntry[];
}

export interface UseBandAnalyticsParams {
  gender: 'M' | 'F';
  mode?: 'meet' | 'season';
  courseId?: string;
  seasons?: number[];
}

export const useBandAnalytics = ({ gender, mode = 'meet', courseId, seasons }: UseBandAnalyticsParams) => {
  return useQuery<BandAnalyticsData, Error>({
    queryKey: ['bandAnalytics', gender, mode, courseId, seasons?.join(',')],
    queryFn: async () => {
      const params: Record<string, string> = { gender, mode };
      if (courseId) params.courseId = courseId;
      if (seasons && seasons.length > 0) params.seasons = seasons.join(',');

      const response = await api.get<BandAnalyticsData>('/analytics/bands', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export interface BandCourseOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export const useBandAnalyticsCourses = () => {
  return useQuery<BandCourseOption[], Error>({
    queryKey: ['bandAnalyticsCourses'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; courses: BandCourseOption[] }>('/analytics/bands/courses');
      return response.data.courses;
    },
    staleTime: 1000 * 60 * 10,
  });
};
