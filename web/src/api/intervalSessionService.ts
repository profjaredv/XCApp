import api from './api';

// A stable pace-zone key — 'mcm-vo2' for a default zone, 'team:DIS' for one
// the team defined. NOT a PaceZone.id: those change on every settings save.
// See lib/paceZoneLookup.ts.
export type IntervalZoneKey = string;

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
  zone: IntervalZoneKey;
  // The zone's name when this session was created. Keeps an old session
  // readable after its zone is renamed or deleted; the live definition is
  // preferred when there still is one.
  zoneLabel: string | null;
  archived: boolean;
  entries: IntervalSessionEntry[];
}

export interface CreateIntervalSessionInput {
  seasonId: string;
  groupId?: string | null;
  date: string;
  title: string;
  repDistanceM: number;
  zone: IntervalZoneKey;
  zoneLabel?: string | null;
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

  // Schedule rework: "one interval sheet gets created, then another coach
  // duplicates it and selects their group." A fully independent new
  // session, entries seeded from that group's current roster.
  async duplicate(id: string, input: { groupId?: string | null; date?: string }): Promise<IntervalSession> {
    const response = await api.post<IntervalSession>(`/interval-sessions/${id}/duplicate`, input);
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
