import api from './api';

// Track & Field (docs/leadpack-track-field-handoff.md). Every endpoint is
// coach-gated and scoped to the signed-in coach's own team server-side
// (backend/routes/track.js).

export interface TrackEvent {
  id: string;
  name: string;
  category: string;
  unit: string;
  scoringDirection: string;
  isRelay: boolean;
  sortOrder: number;
}

export interface TrackSeason {
  year: number;
  meetCount: number;
  resultCount: number;
}

export interface TrackMeetSummary {
  id: string;
  name: string;
  date: string;
  sourceUrl: string | null;
  resultCount: number;
}

export interface TrackResultRow {
  id: string;
  eventId: string;
  athleteId: string | null;
  athleteName: string | null;
  gender: string | null;
  grade: number | null;
  round: string | null;
  markValue: number | null;
  wind: number | null;
  place: number | null;
  status: string;
  meetId: string;
  meetName: string;
  date: string;
  season: number;
}

export interface RelayLeg {
  athleteId: string;
  name: string;
}

export interface TrackMeetRow extends TrackResultRow {
  relayAthleteIds: string[];
  relayTeam: string | null;
  legs: RelayLeg[];
  isPr: boolean;
}

export interface TrackMeetDetail {
  meet: { id: string; name: string; date: string; season: number; location: string | null; notes: string | null; sourceUrl: string | null };
  hasResults: boolean;
  events: Array<{ event: TrackEvent; rows: TrackMeetRow[] }>;
}

export interface TrackSummary {
  year: number;
  rosterCount: number;
  meetCount: number;
  resultCount: number;
  eventCount: number;
  upcoming: Array<{ id: string; name: string; date: string; location: string | null; notes: string | null }>;
  lastMeet: { id: string; name: string; date: string } | null;
  lastMeetPrs: Array<{ id: string; athleteId: string; athleteName: string; markValue: number; previous: number | null; event: TrackEvent }>;
}

export interface RelaySuggestion {
  legEvent: TrackEvent | null;
  candidates: TrackResultRow[];
  projected: number | null;
}

export interface TrackRelayAppearance extends TrackResultRow {
  event: TrackEvent;
  legs: RelayLeg[];
  leg: number;
  relayTeam: string | null;
}

export interface TrackRosterAthlete {
  id: string;
  name: string;
  gender: string | null;
  grade: number | null;
  onRoster: boolean;
}

export interface TrackProgramCell {
  best: number;
  bestAthleteId: string;
  bestAthleteName: string | null;
  depthAvg: number | null;
  depthCount: number;
  athletes: number;
  inSeasonPct: number | null;
  inSeasonCount: number;
  returningPct: number | null;
  returners: number;
}

export interface TrackProgram {
  seasons: number[];
  depth: number;
  events: Array<{ event: TrackEvent; bySeason: Record<string, TrackProgramCell> }>;
}

export interface MyUpcomingMeet {
  id: string;
  name: string;
  date: string;
  location: string | null;
  notes: string | null;
  entries: Array<{ event: string; relayTeam: string | null; leg: number | null; squad: string[] }>;
}

export interface RelayInput {
  eventId: string;
  gender: TrackGender;
  relayTeam: string;
  athleteIds: string[];
  mark?: string;
  place?: string;
}

export interface TrackEventLeaders {
  event: TrackEvent;
  leaders: TrackResultRow[];
  /** Relay events only: every squad's time this season, fastest first. */
  relays: TrackMeetRow[];
}

export interface TrackPoints {
  table: number[];
  seasons: number[];
  events: Array<{ event: TrackEvent; bySeason: Record<string, { points: number; scorers: number; entrants: number }> }>;
}

export interface TrackAthleteProgression {
  athlete: { id: string; name: string; gender: string | null; graduationYear: number | null };
  events: Array<{
    event: TrackEvent;
    pr: number | null;
    marks: Array<TrackResultRow & { isPr: boolean }>;
    seasonBests: Array<{ season: number; best: TrackResultRow }>;
  }>;
  relays: TrackRelayAppearance[];
}

export interface TrackImportSummary {
  success: boolean;
  message: string;
  recordsProcessed: number;
  skippedMissing: number;
  skippedDate: number;
  unmatchedEvents: string[];
}

export type TrackGender = 'M' | 'F';

export const trackService = {
  async getSeasons(): Promise<TrackSeason[]> {
    return (await api.get<TrackSeason[]>('/track/seasons')).data;
  },
  async getMeets(year: number): Promise<TrackMeetSummary[]> {
    return (await api.get<TrackMeetSummary[]>(`/track/seasons/${year}/meets`)).data;
  },
  async getLeaders(year: number, gender: TrackGender): Promise<TrackEventLeaders[]> {
    return (await api.get<TrackEventLeaders[]>(`/track/seasons/${year}/leaders`, { params: { gender } })).data;
  },
  async getPoints(gender: TrackGender): Promise<TrackPoints> {
    return (await api.get<TrackPoints>('/track/points', { params: { gender } })).data;
  },
  async getAthlete(athleteId: string): Promise<TrackAthleteProgression> {
    return (await api.get<TrackAthleteProgression>(`/track/athletes/${athleteId}`)).data;
  },
  async getSummary(year: number): Promise<TrackSummary> {
    return (await api.get<TrackSummary>(`/track/seasons/${year}/summary`)).data;
  },
  async getEvents(): Promise<TrackEvent[]> {
    return (await api.get<TrackEvent[]>('/track/events')).data;
  },
  /** The season's roster, through the same endpoint cross country uses. */
  async getRoster(year: number): Promise<TrackRosterAthlete[]> {
    const all = (await api.get<TrackRosterAthlete[]>('/athletes', { params: { season: year } })).data;
    return all.filter((a) => a.onRoster).sort((a, b) => a.name.localeCompare(b.name));
  },
  async getMeet(meetId: string): Promise<TrackMeetDetail> {
    return (await api.get<TrackMeetDetail>(`/track/meets/${meetId}`)).data;
  },
  async createMeet(input: { name: string; date: string; season: number; location?: string }): Promise<{ id: string }> {
    return (await api.post<{ id: string }>('/track/meets', input)).data;
  },
  async updateMeet(meetId: string, input: { location?: string; notes?: string }): Promise<void> {
    await api.put(`/track/meets/${meetId}`, input);
  },
  async deleteMeet(meetId: string): Promise<void> {
    await api.delete(`/track/meets/${meetId}`);
  },
  async setEntries(meetId: string, eventId: string, athleteIds: string[]): Promise<void> {
    await api.put(`/track/meets/${meetId}/entries`, { eventId, athleteIds });
  },
  async createRelay(meetId: string, input: RelayInput): Promise<void> {
    await api.post(`/track/meets/${meetId}/relays`, input);
  },
  async updateRelay(resultId: string, input: Omit<RelayInput, 'eventId'>): Promise<void> {
    await api.put(`/track/relays/${resultId}`, input);
  },
  async deleteRelay(resultId: string): Promise<void> {
    await api.delete(`/track/relays/${resultId}`);
  },
  async suggestRelay(year: number, eventId: string, gender: TrackGender): Promise<RelaySuggestion> {
    return (await api.get<RelaySuggestion>(`/track/seasons/${year}/relay-suggest`, { params: { eventId, gender } })).data;
  },
  async getProgram(gender: TrackGender): Promise<TrackProgram> {
    return (await api.get<TrackProgram>('/track/program', { params: { gender } })).data;
  },
  /** The signed-in athlete's meets to come, with the plan and their own entries. */
  async getMyUpcoming(): Promise<MyUpcomingMeet[]> {
    return (await api.get<MyUpcomingMeet[]>('/track-me/upcoming')).data;
  },
  /** The signed-in athlete's own record. */
  async getMine(): Promise<TrackAthleteProgression> {
    return (await api.get<TrackAthleteProgression>('/track-me')).data;
  },
  async importEventProgressCsv(year: number, csv: string): Promise<TrackImportSummary> {
    return (await api.post<TrackImportSummary>(`/track/seasons/${year}/import-event-progress-csv`, { csv })).data;
  },
};
