import { AnalyticsData } from '@/types/analytics';

/**
 * Fetches analytics data from the API
 */
export const getAnalytics = async (): Promise<{ data: AnalyticsData | null }> => {
  try {
    // In a real implementation, this would be an actual API call
    // const response = await fetch('/api/analytics');
    // return await response.json();
    
    // For now, return null to trigger the mock data fallback
    return { data: null };
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return { data: null };
  }
};

/**
 * Fetches a list of available seasons
 */
export const getSeasons = async (): Promise<number[]> => {
  try {
    // In a real implementation, this would be an actual API call
    // const response = await fetch('/api/seasons');
    // return await response.json();
    
    // Return mock data for now
    return [2024, 2023, 2022];
  } catch (error) {
    console.error('Error fetching seasons:', error);
    return [2024];
  }
};
