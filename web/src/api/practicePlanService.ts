import api from './api';

// Schedule rework: one shared plan per day (no more per-group assignment
// rows). Location/template/interval-session are live references — the
// backend resolves and embeds their display fields alongside the id.

export interface PracticePlanWorkoutTemplate {
  id: string;
  name: string;
  volumeTier: string | null;
  focus: string | null;
  durationMinutes: number | null;
  distanceMi: number | null;
  strength: boolean;
  details: string | null;
}

export interface PracticePlanIntervalSession {
  id: string;
  title: string;
  groupId: string | null;
  groupName: string | null;
  repDistanceM: number;
  zone: string;
}

export interface PracticePlan {
  id: string;
  date: string;
  published: boolean;
  startTime: string | null;
  locationId: string | null;
  locationName: string | null;
  announcements: string | null;
  preRun: string | null;
  run: string | null;
  postRun: string | null;
  workoutTemplateId: string | null;
  workoutTemplate: PracticePlanWorkoutTemplate | null;
  intervalSessionId: string | null;
  intervalSession: PracticePlanIntervalSession | null;
}

// Every field but seasonId/date is optional and should stay that way:
// the day editor only includes a field here when the coach actually
// edited it in that dialog session, never a full resend of every field
// from whatever was loaded when the dialog opened. The backend only
// writes keys actually present in the request body — omitting a field
// leaves it exactly as it already is, so two coaches editing different
// fields of the same day's plan around the same time can't have one
// save blank out the other's already-saved field.
export interface PracticePlanInput {
  seasonId: string;
  date: string;
  locationId?: string | null;
  startTime?: string | null;
  announcements?: string | null;
  preRun?: string | null;
  run?: string | null;
  postRun?: string | null;
  workoutTemplateId?: string | null;
  intervalSessionId?: string | null;
}

export const practicePlanService = {
  async listRange(seasonId: string, from: string, to: string): Promise<PracticePlan[]> {
    const response = await api.get<PracticePlan[]>('/practice-plans', { params: { seasonId, from, to } });
    return response.data;
  },

  /** Every practice plan in the season, no date bound — the Schedule List view. */
  async listSeason(seasonId: string): Promise<PracticePlan[]> {
    const response = await api.get<PracticePlan[]>('/practice-plans', { params: { seasonId } });
    return response.data;
  },

  async myPlan(date: string): Promise<{ date: string; plan: PracticePlan | null }> {
    const response = await api.get('/practice-plans/mine', { params: { date } });
    return response.data;
  },

  async savePlan(input: PracticePlanInput): Promise<PracticePlan> {
    const response = await api.post<PracticePlan>('/practice-plans', input);
    return response.data;
  },

  async setPublished(planId: string, published: boolean): Promise<PracticePlan> {
    const response = await api.put<PracticePlan>(`/practice-plans/${planId}/publish`, { published });
    return response.data;
  },

  async duplicateDay(planId: string, toDate: string, toSeasonId?: string): Promise<PracticePlan> {
    const response = await api.post<PracticePlan>(`/practice-plans/${planId}/duplicate-day`, { toDate, toSeasonId });
    return response.data;
  },

  async duplicateWeek(input: { seasonId: string; fromWeekStart: string; toWeekStart: string; toSeasonId?: string }) {
    const response = await api.post('/practice-plans/duplicate-week', input);
    return response.data as { msg: string; count: number };
  },

  async exportRange(seasonId: string, from: string, to: string) {
    const response = await api.get('/practice-plans/export', { params: { seasonId, from, to } });
    return response.data as { headers: string[]; rows: Record<string, string>[] };
  },

  /** Every practice plan in the season, no date bound. */
  async exportSeason(seasonId: string) {
    const response = await api.get('/practice-plans/export', { params: { seasonId } });
    return response.data as { headers: string[]; rows: Record<string, string>[] };
  },

  async importCsv(seasonId: string, csvData: string) {
    const response = await api.post('/practice-plans/import', { seasonId, csvData });
    return response.data as { msg: string; imported: number; skipped: number; warnings: Array<{ row: number; message: string }> };
  },
};
