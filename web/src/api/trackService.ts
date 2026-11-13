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

export interface TrackEventLeaders {
  event: TrackEvent;
  leaders: TrackResultRow[];
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
  async importEventProgressCsv(year: number, csv: string): Promise<TrackImportSummary> {
    return (await api.post<TrackImportSummary>(`/track/seasons/${year}/import-event-progress-csv`, { csv })).data;
  },
};
