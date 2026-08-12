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

export interface GroupAnalyticsAthlete {
  athleteId: string;
  name: string;
  grade: number | null;
  /** The season this athlete's numbers actually come from — equals the requested season unless isFallback is true. */
  season: number | null;
  /** True when this athlete had no races in the requested season and these numbers are their most recent prior season instead. */
  isFallback: boolean | null;
  raceCount: number;
  bestPaceSecPerMile: number | null;
  avgPaceSecPerMile: number | null;
}

export interface GroupAnalyticsSummary {
  athleteCount: number;
  /** Athletes whose numbers are from the requested season itself — the only ones counted in avgPaceSecPerMile/bestPaceSecPerMile below. */
  currentSeasonCount: number;
  /** Athletes shown via prior-season fallback — visible per-athlete, deliberately excluded from this group's own aggregate. */
  fallbackCount: number;
  neverRacedCount: number;
  avgPaceSecPerMile: number | null;
  bestPaceSecPerMile: number | null;
}

export interface GroupAnalytics {
  id: string;
  name: string;
  type: GroupType;
  gender: string | null;
  athletes: GroupAnalyticsAthlete[];
  summary: GroupAnalyticsSummary;
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

  async assignLeader(groupId: string, userId: string, primary = false): Promise<void> {
    await api.post(`/groups/${groupId}/leaders`, { userId, primary });
  },

  async removeLeader(groupId: string, userId: string): Promise<void> {
    await api.delete(`/groups/${groupId}/leaders/${userId}`);
  },

  /** Moves one athlete into a group (effective-dated — see lib/groups.js), for CAPTAIN/CUSTOM groups the bulk TRAINING screen doesn't cover. */
  async addMember(groupId: string, athleteId: string): Promise<void> {
    await api.post(`/groups/${groupId}/members`, { athleteId });
  },

  /** Takes an athlete OUT of a group with nothing opening in its place. */
  async removeMember(groupId: string, athleteId: string): Promise<void> {
    await api.delete(`/groups/${groupId}/members/${athleteId}`);
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

  /** Filter/compare groups' current rosters, normalized to pace. Omit groupIds for "all training groups this season." */
  async getGroupAnalytics(seasonId: string, groupIds?: string[]): Promise<GroupAnalytics[]> {
    const response = await api.get<GroupAnalytics[]>('/groups/analytics', {
      params: { seasonId, ...(groupIds && groupIds.length > 0 ? { groupIds: groupIds.join(',') } : {}) },
    });
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
