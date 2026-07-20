import { axiosInstance } from './axios';
import { AnalyticsData } from '@/types/analytics';

interface AnalyticsService {
  getAnalyticsOverview(season: number): Promise<AnalyticsData>;
}

export const analyticsService: AnalyticsService = {
  async getAnalyticsOverview(season: number) {
    const response = await axiosInstance.get<AnalyticsData>('/analytics/overview', {
      params: { seasons: season.toString() },
    });
    return response.data;
  },
};
