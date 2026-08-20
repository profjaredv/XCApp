import api from './api';

export type IntervalZone = 'threshold' | 'interval' | 'repetition';

export interface IntervalSessionEntry {
  id: string;
  athleteId: string;
  athleteName: string;
  addedManually: boolean;
  rep1: number | null;
  rep2: number | null;
  rep3: number | null;
  rep4: number | null;
  rep5: number | null;
  rep6: number | null;
  notes: string | null;
}

export interface IntervalSession {
  id: string;
  seasonId: string;
  groupId: string | null;
  groupName: string | null;
  date: string;
  title: string;
  repDistanceM: number;
  zone: IntervalZone;
  archived: boolean;
  entries: IntervalSessionEntry[];
}

export interface CreateIntervalSessionInput {
  seasonId: string;
  groupId?: string | null;
  date: string;
  title: string;
  repDistanceM: number;
  zone: IntervalZone;
  athleteIds?: string[];
}

export interface RepUpdateInput {
  rep1?: number | null;
  rep2?: number | null;
  rep3?: number | null;
  rep4?: number | null;
  rep5?: number | null;
  rep6?: number | null;
  notes?: string | null;
}

export const intervalSessionService = {
  async list(seasonId: string, from?: string, to?: string): Promise<IntervalSession[]> {
    const response = await api.get<IntervalSession[]>('/interval-sessions', { params: { seasonId, from, to } });
    return response.data;
  },

  async get(id: string): Promise<IntervalSession> {
    const response = await api.get<IntervalSession>(`/interval-sessions/${id}`);
    return response.data;
  },

  async create(input: CreateIntervalSessionInput): Promise<IntervalSession> {
    const response = await api.post<IntervalSession>('/interval-sessions', input);
    return response.data;
  },

  async remove(id: string) {
    const response = await api.delete(`/interval-sessions/${id}`);
    return response.data;
  },

  async setArchived(id: string, archived: boolean): Promise<IntervalSession> {
    const response = await api.put<IntervalSession>(`/interval-sessions/${id}`, { archived });
    return response.data;
  },

  async addEntry(sessionId: string, athleteId: string): Promise<IntervalSessionEntry> {
    const response = await api.post<IntervalSessionEntry>(`/interval-sessions/${sessionId}/entries`, { athleteId });
    return response.data;
  },

  async updateEntry(entryId: string, input: RepUpdateInput): Promise<IntervalSessionEntry> {
    const response = await api.put<IntervalSessionEntry>(`/interval-sessions/entries/${entryId}`, input);
    return response.data;
  },

  async removeEntry(entryId: string) {
    const response = await api.delete(`/interval-sessions/entries/${entryId}`);
    return response.data;
  },
};
