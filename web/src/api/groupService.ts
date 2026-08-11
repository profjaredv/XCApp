import api from './api';

export type GroupType = 'TRAINING' | 'CAPTAIN' | 'CUSTOM';

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  gender: string | null;
  sortOrder: number;
  color: string | null;
  archived: boolean;
  activeMemberCount: number;
  leaders: Array<{ userId: string; name: string | null; email: string; primary: boolean }>;
}

export interface GroupMember {
  membershipId: string;
  athleteId: string;
  name: string;
  gender: string | null;
  grade: number | null;
  startDate: string;
}

// The bulk assignment screen needs every athlete's most recent season-best
// time on their card (per the doc), which /api/athletes already returns as
// per-race results — this is a narrower type than rosterService's
// RosterAthlete, adding just the `races` field this screen actually reads.
export interface RosterAthleteWithRaces {
  id: string;
  name: string;
  gender: string | null;
  grade: number | null;
  races: Array<{ time: number | null; race: { date: string; distanceMeters: number | null } }>;
}

export const groupService = {
  async listGroups(seasonId: string): Promise<Group[]> {
    const response = await api.get<Group[]>('/groups', { params: { seasonId } });
    return response.data;
  },

  async listMembers(groupId: string): Promise<GroupMember[]> {
    const response = await api.get<GroupMember[]>(`/groups/${groupId}/members`);
    return response.data;
  },

  /** Every group's current members at once, keyed by groupId — the bulk
   * assignment screen needs to know "who's already where" across every
   * group simultaneously, not one at a time. */
  async listAllMembers(groupIds: string[]): Promise<Record<string, GroupMember[]>> {
    const entries = await Promise.all(
      groupIds.map(async (groupId) => [groupId, await groupService.listMembers(groupId)] as const)
    );
    return Object.fromEntries(entries);
  },

  async createGroup(input: {
    seasonId: string;
    name: string;
    type: GroupType;
    gender?: string | null;
    sortOrder?: number;
    color?: string | null;
  }): Promise<Group> {
    const response = await api.post<Group>('/groups', input);
    return response.data;
  },

  async updateGroup(
    groupId: string,
    input: Partial<{ name: string; sortOrder: number; color: string | null; archived: boolean }>
  ): Promise<Group> {
    const response = await api.put<Group>(`/groups/${groupId}`, input);
    return response.data;
  },

  async deleteGroup(groupId: string): Promise<void> {
    await api.delete(`/groups/${groupId}`);
  },

  async bulkAssign(input: {
    assignments: Array<{ athleteId: string; groupId: string }>;
    effectiveDate?: string;
  }): Promise<{ msg: string; count: number }> {
    const response = await api.post('/groups/assign', input);
    return response.data;
  },

  async copyFromSeason(fromSeasonId: string, toSeasonId: string) {
    const response = await api.post('/groups/copy-from-season', { fromSeasonId, toSeasonId });
    return response.data;
  },

  /** Roster with per-race results, for computing each athlete's season-best on the card. */
  async getRosterWithRaces(season: number): Promise<RosterAthleteWithRaces[]> {
    const response = await api.get<RosterAthleteWithRaces[]>('/athletes', { params: { season } });
    return response.data;
  },
};

/** Fastest (lowest) recorded time this season, or null if the athlete hasn't raced yet. */
export function seasonBestTime(athlete: RosterAthleteWithRaces): number | null {
  const times = athlete.races.map((r) => r.time).filter((t): t is number => typeof t === 'number' && t > 0);
  return times.length > 0 ? Math.min(...times) : null;
}

export function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
