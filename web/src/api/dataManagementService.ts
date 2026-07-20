import api from '../api/api';

export interface ClearDataResponse {
  racesDeleted: number;
  resultsDeleted: number;
  metricsDeleted: number;
}

export interface ImportDataResponse {
  racesImported: number;
  athletesImported: number;
  resultsImported: number;
}

export interface CalculateMetricsResponse {
  athleteCount: number;
  raceCount: number;
  resultCount: number;
  totalMiles: number;
}

/**
 * Service for data management operations
 */
export const dataManagementService = {
  /**
   * Clear data for a specific team and season
   */
  clearData: async (teamId: string, season: string): Promise<ClearDataResponse> => {
    // teamId is accepted for API-shape compatibility with callers, but the
    // backend derives team from the authenticated session, not the URL.
    void teamId;
    const response = await api.post<ClearDataResponse>(`/data/clear/${season}`);
    return response.data;
  },

  /**
   * Import data for a specific team and season
   */
  importData: async (teamId: string, season: string, _athleticNetTeamId: string): Promise<ImportDataResponse> => {
    // Parameter 'teamId' is not required by /teams/scrape (team inferred from auth),
    // but we accept it to keep a consistent API. Mark as intentionally unused:
    void teamId;
    void _athleticNetTeamId;
    // Use the proven scraper endpoint used by ImportPage: POST /teams/scrape with { year }
    // Backend derives the team from auth context; teamId is not required by this endpoint.
    const resp = await api.post(`/teams/scrape`, { year: season });
    // Transform response to the expected shape for the Data Management UI
    // teams/scrape returns: { success, message, recordsProcessed, skippedMissing, skippedDate, totalRecords }
    const processed = resp.data?.recordsProcessed ?? 0;
    return {
      racesImported: processed, // best available proxy; backend does not return per-type counts here
      athletesImported: 0,
      resultsImported: processed,
    };
  },

  /**
   * Calculate metrics for a specific team and season
   */
  calculateMetrics: async (teamId: string, season: string): Promise<CalculateMetricsResponse> => {
    // teamId kept for API-shape compatibility; the backend derives team from
    // the authenticated session, not the URL.
    void teamId;
    // 1) Trigger real calculation pipeline with synchronous option (returns computed metrics)
    //    If the server doesn't support wait=true (older build), we'll fall back to polling.
    try {
      const calcResp = await api.post(`/performance/calculate/${season}?wait=true`);
      const calcPayload = calcResp.data || {};
      const data = calcPayload.data || {};
      const m = data?.metrics || {};
      const athleteCount = Number(m.athleteCount || 0);
      const raceCount = Number(m.totalRaces || 0);
      const totalMiles = Number(m.totalMiles || 0);
      const resultCount = Number(m.resultCount || 0);
      if (athleteCount > 0 || raceCount > 0 || totalMiles > 0 || resultCount > 0) {
        return {
          athleteCount,
          raceCount,
          totalMiles,
          resultCount: resultCount || raceCount,
        };
      }
    } catch {
      // Synchronous calculation not supported, fall back to polling
    }

    // 2) Poll the results endpoint until metrics are available or timeout
    const maxAttempts = 60; // ~60 * 1s = 60s max wait for larger datasets
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const resp = await api.get(`/performance/team/season/${season}`);
        const payload = resp.data || {};
        const metricsDoc = payload.data || payload; // backend wraps under { success, data }
        const m = metricsDoc?.metrics || {};

        // If we have any meaningful metrics, return them
        const athleteCount = Number(m.athleteCount || 0);
        const raceCount = Number(m.totalRaces || 0);
        const totalMiles = Number(m.totalMiles || 0);
        const resultCount = Number(m.resultCount || 0); // may not exist; fallback below

        if (athleteCount > 0 || raceCount > 0 || totalMiles > 0 || resultCount > 0) {
          return {
            athleteCount,
            raceCount,
            totalMiles,
            resultCount: resultCount || raceCount, // fallback if not present
          };
        }
      } catch {
        // ignore during polling
      }
      attempts += 1;
      await delay(1000);
    }

    // 3) If nothing materialized, return zeros (UI will still show completion)
    return { athleteCount: 0, raceCount: 0, resultCount: 0, totalMiles: 0 };
  },

  /**
   * Calculate enhanced metrics for a specific team and season
   */
  calculateEnhancedMetrics: async (teamId: string, season: string): Promise<CalculateMetricsResponse> => {
    try {
      const calcResp = await api.post(`/enhanced-performance/calculate/${season}?wait=true`);
      const calcPayload = calcResp.data || {};
      
      return {
        athleteCount: Number(calcPayload.athleteCount || 0),
        raceCount: Number(calcPayload.raceCount || 0),
        totalMiles: Number(calcPayload.totalMiles || 0),
        resultCount: Number(calcPayload.raceCount || 0)
      };
    } catch (error) {
      console.error('Enhanced metrics calculation failed:', error);
      // Fallback to regular metrics calculation
      return dataManagementService.calculateMetrics(teamId, season);
    }
  }
};

export default dataManagementService;
