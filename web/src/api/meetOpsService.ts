import api from './api';

export type EntryStatus = 'ENTERED' | 'ALTERNATE' | 'NOT_ENTERED' | 'SCRATCHED' | 'INJURED' | 'ACADEMIC' | 'EXCUSED';

export const ENTRY_STATUSES: EntryStatus[] = [
  'NOT_ENTERED',
  'ENTERED',
  'ALTERNATE',
  'SCRATCHED',
  'INJURED',
  'ACADEMIC',
  'EXCUSED',
];

export interface MeetSummary {
  id: string;
  name: string;
  date: string;
  location: string | null;
  races: Array<{ id: string; name: string; distance: string | null }>;
  planPublished: boolean;
}

export interface MeetPlan {
  id?: string;
  meetId?: string;
  departureTime: string | null;
  returnTime: string | null;
  departureLoc: string | null;
  transportNotes: string | null;
  uniformNotes: string | null;
  bringList: string | null;
  itinerary: Array<{ time: string; label: string }> | null;
  published: boolean;
}

export interface MeetDetail {
  id: string;
  name: string;
  date: string;
  location: string | null;
  races: Array<{ id: string; name: string; distance: string | null }>;
  plan: MeetPlan | null;
}

export interface MeetEntryRow {
  athleteId: string;
  name: string;
  gender: string | null;
  grade: number | null;
  seasonBestSec: number | null;
  status: EntryStatus;
  seedTimeSec: number | null;
  bibNumber: string | null;
  notes: string | null;
}

export interface EntriesResponse {
  raceId: string;
  raceName: string;
  entries: MeetEntryRow[];
  enteredCount: number;
  entryCapWarning: boolean;
}

export interface MyMeetCard {
  meet: { id: string; name: string; date: string; location: string | null } | null;
  race: { id: string; name: string; distance: string | null } | null;
  entry: { status: EntryStatus; bibNumber: string | null; seedTimeSec: number | null; notes: string | null } | null;
  plan: MeetPlan | null;
}

export interface ProposedMeet {
  proposedName: string;
  location: string | null;
  date: string;
  raceNames: string[];
  raceCount: number;
  raceIds: string[];
}

export interface PrintableRoster {
  meet: { id: string; name: string; date: string; location: string | null };
  races: Array<{
    id: string;
    name: string;
    entries: Array<{ athleteId: string; name: string; grade: number | null; bibNumber: string | null; seedTimeSec: number | null; status: EntryStatus }>;
  }>;
}

export function formatTimeSec(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const meetOpsService = {
  async listMeets(seasonId: string): Promise<MeetSummary[]> {
    const response = await api.get<MeetSummary[]>('/meet-ops', { params: { seasonId } });
    return response.data;
  },

  async getMeet(meetId: string): Promise<MeetDetail> {
    const response = await api.get<MeetDetail>(`/meet-ops/${meetId}`);
    return response.data;
  },

  async createMeet(input: { seasonId: string; name: string; date: string; location?: string }): Promise<MeetDetail> {
    const response = await api.post<MeetDetail>('/meet-ops', input);
    return response.data;
  },

  async updateMeet(meetId: string, input: Partial<{ name: string; date: string; location: string }>): Promise<MeetDetail> {
    const response = await api.put<MeetDetail>(`/meet-ops/${meetId}`, input);
    return response.data;
  },

  async getEntries(raceId: string): Promise<EntriesResponse> {
    const response = await api.get<EntriesResponse>(`/meet-ops/races/${raceId}/entries`);
    return response.data;
  },

  async saveEntries(
    raceId: string,
    entries: Array<{ athleteId: string; status: EntryStatus; seedTimeSec?: number | null; bibNumber?: string | null; notes?: string | null }>
  ) {
    const response = await api.put(`/meet-ops/races/${raceId}/entries`, { entries });
    return response.data as { msg: string; count: number; enteredCount: number; entryCapWarning: boolean };
  },

  async getPlan(meetId: string): Promise<MeetPlan | null> {
    const response = await api.get<MeetPlan | null>(`/meet-ops/${meetId}/plan`);
    return response.data;
  },

  async savePlan(meetId: string, input: MeetPlan): Promise<MeetPlan> {
    const response = await api.put<MeetPlan>(`/meet-ops/${meetId}/plan`, input);
    return response.data;
  },

  async getRoster(meetId: string): Promise<PrintableRoster> {
    const response = await api.get<PrintableRoster>(`/meet-ops/${meetId}/roster`);
    return response.data;
  },

  async myMeetCard(): Promise<MyMeetCard> {
    const response = await api.get<MyMeetCard>('/meet-ops/mine');
    return response.data;
  },

  /** Groups this season's races that don't already belong to a Meet, by an exact (team, season, date) match — proposes only, writes nothing. */
  async proposeImport(seasonId: string): Promise<ProposedMeet[]> {
    const response = await api.get<ProposedMeet[]>('/meet-ops/import/propose', { params: { seasonId } });
    return response.data;
  },

  async confirmImport(seasonId: string, meets: Array<{ name: string; date: string; location?: string | null; raceIds: string[] }>) {
    const response = await api.post('/meet-ops/import', { seasonId, meets });
    return response.data as { msg: string; meets: Array<{ id: string; name: string; raceCount: number }> };
  },
};
