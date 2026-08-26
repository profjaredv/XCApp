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
  isHome: boolean | null;
  // myEntryStatus is only present when the caller has a linkedAthlete — the
  // athlete/read-only "Meets" nav view (B4) uses it; coaches never see it.
  races: Array<{ id: string; name: string; distance: string | null; myEntryStatus?: EntryStatus }>;
}

export interface MeetRace {
  id: string;
  name: string;
  distance: string | null;
  distanceMeters?: number | null;
  isManual?: boolean;
}

export interface MeetDetail {
  id: string;
  name: string;
  date: string;
  location: string | null;
  isHome: boolean | null;
  races: MeetRace[];
  /** The season year this meet belongs to — needed to fetch the roster for results entry. */
  seasonYear: number | null;
}

export type ResultStatus = 'FINISHED' | 'DNF' | 'DNS' | 'DQ';

export interface RaceResultsDetail {
  race: {
    id: string;
    name: string;
    date: string;
    distance: string | null;
    distanceMeters: number | null;
    isManual: boolean;
    season: number;
  };
  results: Array<{ athleteId: string; time: number | null; status: ResultStatus }>;
}

export interface RaceResultEntry {
  athleteId: string;
  /**
   * Seconds, or null to clear. Omit the key entirely (not just `undefined`
   * — that still serializes as absent, which is what matters) for an
   * athlete whose time isn't being touched by this save; the backend only
   * writes fields actually present here, so a save covering some of a
   * race's athletes never touches anyone else's already-saved result.
   * Same for status below. Null with no status touched clears the result.
   */
  time?: number | null;
  status?: ResultStatus;
}

// An unfinished Live Timer session — captured finish times not yet
// assigned to athletes and saved as real Results. See the backend's
// TimerSession schema comment for why this is persisted at all.
export interface TimerSessionDraft {
  id: string;
  raceId: string;
  /** Elapsed seconds since the session's own start, in capture order. */
  captures: number[];
  /** Capture index (as a string key) -> athleteId. */
  assignments: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface MyMeetCard {
  meet: { id: string; name: string; date: string; location: string | null; isHome: boolean | null } | null;
  race: { id: string; name: string; distance: string | null } | null;
  entry: { status: EntryStatus; bibNumber: string | null; seedTimeSec: number | null; notes: string | null } | null;
}

export interface ProposedMeet {
  proposedName: string;
  location: string | null;
  date: string;
  raceNames: string[];
  raceCount: number;
  raceIds: string[];
}

export interface ProposedCalendarMeet {
  athleticMeetId: string;
  name: string;
  date: string;
  location: string | null;
  /** A Meet already exists for this Athletic.net meet ID — confirming again just refreshes name/date/location. */
  alreadyImported: boolean;
  /** Races already scraped for this meet ID but not yet linked to a Meet — confirming links them. */
  unlinkedRaceCount: number;
}

export function formatTimeSec(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Shared between TodayPage's "Next meet" block and the athlete/read-only
// Meets list (B4) — one place for "what does this status mean in English."
export function entryStatusLabel(status: EntryStatus | undefined): string {
  switch (status) {
    case 'ENTERED':
      return 'You are entered.';
    case 'ALTERNATE':
      return 'You are an alternate.';
    case 'SCRATCHED':
      return "You've been scratched.";
    case 'INJURED':
      return 'Marked injured for this meet.';
    case 'ACADEMIC':
      return 'Marked out for academic reasons.';
    case 'EXCUSED':
      return 'Excused from this meet.';
    default:
      return 'You are not entered.';
  }
}


export interface ParsedResultRow {
  raw: string;
  place: number | null;
  timeSec: number;
  athleteId: string | null;
  matchedName: string | null;
  matchedOn: string | null;
  duplicate: boolean;
  nameCandidates: string[];
}

export interface ParsedResultsPreview {
  race: { id: string; name: string; date: string; distance: string | null };
  format: 'delimited' | 'freeform' | 'empty';
  skipped: string[];
  rows: ParsedResultRow[];
  summary: { parsed: number; matched: number; unmatched: number; skipped: number };
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

  async createMeet(input: { seasonId: string; name: string; date: string; location?: string; isHome?: boolean | null }): Promise<MeetDetail> {
    const response = await api.post<MeetDetail>('/meet-ops', input);
    return response.data;
  },

  /** A race that never touched the Athletic.net scraper — e.g. an in-house track time trial. */
  async createRace(meetId: string, input: { name: string; date?: string; distanceMeters: number; distance?: string }): Promise<MeetRace> {
    const response = await api.post<MeetRace>(`/meet-ops/${meetId}/races`, input);
    return response.data;
  },

  /** Only ever a manually-created race — see MeetRace.isManual. */
  async deleteRace(raceId: string): Promise<void> {
    await api.delete(`/meet-ops/races/${raceId}`);
  },

  async getRaceResults(raceId: string): Promise<RaceResultsDetail> {
    const response = await api.get<RaceResultsDetail>(`/meet-ops/races/${raceId}/results`);
    return response.data;
  },

  /**
   * Parse a pasted/uploaded results block against the roster. Read-only —
   * the returned rows are submitted through submitRaceResults like any
   * other entry, so import and manual entry share one write path.
   */
  async parseRaceResults(raceId: string, text: string): Promise<ParsedResultsPreview> {
    const response = await api.post<ParsedResultsPreview>(`/meet-ops/races/${raceId}/results/parse`, { text });
    return response.data;
  },

  async submitRaceResults(raceId: string, results: RaceResultEntry[]): Promise<{ success: boolean; saved: number; cleared: number }> {
    const response = await api.post(`/meet-ops/races/${raceId}/results`, { results });
    return response.data;
  },

  /** Unfinished Live Timer drafts for a race — newest first. Multiple concurrent drafts are normal, not an error state. */
  async listTimerSessions(raceId: string): Promise<TimerSessionDraft[]> {
    const response = await api.get<TimerSessionDraft[]>(`/meet-ops/races/${raceId}/timer-sessions`);
    return response.data;
  },

  async createTimerSession(raceId: string, input: { captures: number[]; assignments: Record<string, string> }): Promise<TimerSessionDraft> {
    const response = await api.post<TimerSessionDraft>(`/meet-ops/races/${raceId}/timer-sessions`, input);
    return response.data;
  },

  async updateTimerSession(sessionId: string, input: { captures: number[]; assignments: Record<string, string> }): Promise<TimerSessionDraft> {
    const response = await api.patch<TimerSessionDraft>(`/meet-ops/timer-sessions/${sessionId}`, input);
    return response.data;
  },

  async deleteTimerSession(sessionId: string): Promise<void> {
    await api.delete(`/meet-ops/timer-sessions/${sessionId}`);
  },

  async updateMeet(meetId: string, input: Partial<{ name: string; date: string; location: string; isHome: boolean | null }>): Promise<MeetDetail> {
    const response = await api.put<MeetDetail>(`/meet-ops/${meetId}`, input);
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

  /** Pulls this season's schedule straight from the team's own Athletic.net calendar feed — works before any races have been scraped. Proposes only, writes nothing. */
  async proposeCalendarImport(seasonId: string): Promise<ProposedCalendarMeet[]> {
    const response = await api.get<ProposedCalendarMeet[]>('/meet-ops/import/propose-calendar', { params: { seasonId } });
    return response.data;
  },

  async confirmCalendarImport(
    seasonId: string,
    meets: Array<{ athleticMeetId: string; name: string; date: string; location?: string | null }>
  ) {
    const response = await api.post('/meet-ops/import-calendar', { seasonId, meets });
    return response.data as { msg: string; meets: Array<{ id: string; name: string; linkedRaceCount: number }> };
  },
};
