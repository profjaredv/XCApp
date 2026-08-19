import api from './api';

// Workstream A (LeadPack Master Build Handoff): thin wrapper around the four
// backend/routes/today.js endpoints. Athlete-view Today blocks reuse
// practicePlanService.myPlan / meetOpsService.myMeetCard /
// athleteService.getRecentRaces instead of anything here — see TodayPage.tsx.

export interface TodaySeason {
  id: string;
  year: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}

export interface TodaySeasonState {
  state: 'none' | 'in-season' | 'off-season';
  season: TodaySeason | null;
  lastSeasonSummary: { year: number; rosterCount: number; raceCount: number } | null;
}

export interface TodayMeet {
  id: string;
  name: string;
  date: string;
  location: string | null;
  daysUntil: number;
  planPublished: boolean;
  races: Array<{ id: string; name: string; enteredCount: number }>;
}

export type TodayAttentionItemType = 'splits' | 'entries' | 'unpublished-plan' | 'overdue-equipment';

export interface TodayAttentionItem {
  type: TodayAttentionItemType;
  label: string;
  date: string;
  link: { raceId?: string; meetId?: string; practicePlanId?: string; equipmentAssignmentId?: string };
}

export interface TodayRecentResult {
  id: string;
  name: string;
  date: string;
  finisherCount: number;
  avgTimeSec: number | null;
}

export interface TodayStaffMember {
  userId: string;
  name: string | null;
  email: string;
  role: 'HEAD_COACH' | 'COACH' | 'VOLUNTEER_COACH';
}

export interface TodayStaff {
  athleteCount: number;
  staff: TodayStaffMember[];
}

export type TodayActivityItemType = 'training-log' | 'race-plan' | 'race-reflection';

export interface TodayActivityItem {
  type: TodayActivityItemType;
  athleteId: string;
  athleteName: string;
  date: string;
  summary: string;
  link?: { raceId?: string };
}

export const todayService = {
  async getSeasonState(): Promise<TodaySeasonState> {
    const response = await api.get<TodaySeasonState>('/today/season');
    return response.data;
  },

  async getMeet(seasonId: string): Promise<{ meet: TodayMeet | null }> {
    const response = await api.get<{ meet: TodayMeet | null }>('/today/meet', { params: { seasonId } });
    return response.data;
  },

  async getAttention(seasonId: string): Promise<{ items: TodayAttentionItem[] }> {
    const response = await api.get<{ items: TodayAttentionItem[] }>('/today/attention', { params: { seasonId } });
    return response.data;
  },

  async getRecentResult(seasonId: string): Promise<{ race: TodayRecentResult | null }> {
    const response = await api.get<{ race: TodayRecentResult | null }>('/today/recent-result', { params: { seasonId } });
    return response.data;
  },

  async getStaff(): Promise<TodayStaff> {
    const response = await api.get<TodayStaff>('/today/staff');
    return response.data;
  },

  async getActivity(): Promise<{ items: TodayActivityItem[] }> {
    const response = await api.get<{ items: TodayActivityItem[] }>('/today/activity');
    return response.data;
  },
};
