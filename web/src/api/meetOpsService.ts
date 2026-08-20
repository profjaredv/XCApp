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

export interface MeetDetail {
  id: string;
  name: string;
  date: string;
  location: string | null;
  isHome: boolean | null;
  races: Array<{ id: string; name: string; distance: string | null }>;
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
