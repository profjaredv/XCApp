import api from './api';

export interface PracticePlanAssignment {
  id: string;
  groupId: string | null;
  groupName: string;
  volumeTier: string | null;
  focus: string | null;
  durationMinutes: number | null;
  distanceMi: number | null;
  strength: boolean;
  details: string | null;
  sortOrder: number;
}

export interface PracticePlan {
  id: string;
  date: string;
  title: string | null;
  teamNotes: string | null;
  location: string | null;
  startTime: string | null;
  published: boolean;
  assignments: PracticePlanAssignment[];
}

export interface MyPracticePlanAssignment {
  focus: string | null;
  durationMinutes: number | null;
  distanceMi: number | null;
  strength: boolean;
  details: string | null;
}

export interface MyPracticePlan {
  title: string | null;
  teamNotes: string | null;
  location: string | null;
  startTime: string | null;
  assignments: MyPracticePlanAssignment[];
}

export interface AssignmentInput {
  groupId?: string | null;
  templateId?: string;
  volumeTier?: string | null;
  focus?: string | null;
  durationMinutes?: number | null;
  distanceMi?: number | null;
  strength?: boolean;
  details?: string | null;
  sortOrder?: number;
}

export const practicePlanService = {
  async listWeek(seasonId: string, from: string, to: string): Promise<PracticePlan[]> {
    const response = await api.get<PracticePlan[]>('/practice-plans', { params: { seasonId, from, to } });
    return response.data;
  },

  async myPlan(date: string): Promise<{ date: string; plan: MyPracticePlan | null }> {
    const response = await api.get('/practice-plans/mine', { params: { date } });
    return response.data;
  },

  async saveDayShell(input: {
    seasonId: string;
    date: string;
    title?: string;
    teamNotes?: string;
    location?: string;
    startTime?: string;
  }): Promise<PracticePlan> {
    const response = await api.post<PracticePlan>('/practice-plans', input);
    return response.data;
  },

  async setPublished(planId: string, published: boolean): Promise<PracticePlan> {
    const response = await api.put<PracticePlan>(`/practice-plans/${planId}/publish`, { published });
    return response.data;
  },

  async addAssignment(planId: string, input: AssignmentInput): Promise<PracticePlanAssignment> {
    const response = await api.post<PracticePlanAssignment>(`/practice-plans/${planId}/assignments`, input);
    return response.data;
  },

  async updateAssignment(assignmentId: string, input: Partial<AssignmentInput>): Promise<PracticePlanAssignment> {
    const response = await api.put<PracticePlanAssignment>(`/practice-plans/assignments/${assignmentId}`, input);
    return response.data;
  },

  async deleteAssignment(assignmentId: string): Promise<void> {
    await api.delete(`/practice-plans/assignments/${assignmentId}`);
  },

  async duplicateDay(planId: string, toDate: string, toSeasonId?: string) {
    const response = await api.post(`/practice-plans/${planId}/duplicate-day`, { toDate, toSeasonId });
    return response.data as { id: string };
  },

  async duplicateWeek(input: { seasonId: string; fromWeekStart: string; toWeekStart: string; toSeasonId?: string }) {
    const response = await api.post('/practice-plans/duplicate-week', input);
    return response.data as { msg: string; count: number };
  },
};
