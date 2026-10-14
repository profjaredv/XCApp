import api from './api';

// Meet series — the same meet across seasons (MeetGroup/MeetGroupRace in
// code; "meet series" in the UI, so it never collides with Group). The
// list is the existing GET /meet-groups; history is
// GET /meet-groups/:id/history (docs/leadpack-new-ui-trial.md §4.6).

export interface MeetSeries {
  id: string;
  groupName: string;
  races: Array<{ id: string; name: string; season: number; date: string }>;
  seasons: number[];
}

export interface MeetSeriesHistoryRow {
  season: number;
  distanceMeters: number | null;
  distanceLabel: string | null;
  date: string | null;
  raceIds: string[];
  finishers: number;
  bySex: Record<'M' | 'F', { finishers: number; avgSec: number | null }>;
  /** Only ever the requesting athlete's own result. */
  mine: { raceId: string; timeSec: number } | null;
  /** The most recent earlier season at the same distance, or null — never across distances. */
  comparedTo: { season: number; deltaSec: Record<'M' | 'F', number | null> } | null;
}

export const meetSeriesService = {
  async list(): Promise<MeetSeries[]> {
    const response = await api.get<{ success: boolean; data: MeetSeries[] }>('/meet-groups');
    return response.data.data ?? [];
  },
  async history(id: string): Promise<{ id: string; groupName: string; rows: MeetSeriesHistoryRow[] }> {
    const response = await api.get<{ success: boolean; data: { id: string; groupName: string; rows: MeetSeriesHistoryRow[] } }>(
      `/meet-groups/${id}/history`
    );
    return response.data.data;
  },
};

/** The series a meet belongs to — any of its races linked to one. */
export function seriesForRaces(series: MeetSeries[], raceIds: string[]): MeetSeries | null {
  const ids = new Set(raceIds);
  return series.find((s) => s.races.some((r) => ids.has(r.id))) ?? null;
}
