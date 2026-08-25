import api from './api';

export type GroupType = 'TRAINING' | 'CAPTAIN' | 'CUSTOM' | 'X_TRAINING';

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

// The self-scoped shape GET /groups/me returns — an athlete's own current
// group(s) plus each one's other active members, nothing about the rest
// of the team's group structure.
export interface MyGroup {
  id: string;
  name: string;
  type: GroupType;
  gender: string | null;
  color: string | null;
  members: Array<{ athleteId: string; name: string; gender: string | null; grade: number | null }>;
}

// The bulk assignment screen needs every athlete's most recent season-best
// time on their card (per the doc), which /api/athletes already returns as
// per-race results — this is a narrower type than rosterService's
// RosterAthlete, adding just the `races` field this screen actually reads.
export interface RosterAthleteWithRaces {
  id: string;
  name: string;
  preferredName?: string | null;
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
  /** The year of results actually shown — echoes the request's dataYear (or the group's own season year if omitted). */
  dataYear: number;
  athletes: GroupAnalyticsAthlete[];
  summary: GroupAnalyticsSummary;
}

export interface GroupTrendPoint {
  raceId: string;
  raceName: string;
  date: string;
  athleteCount: number;
  avgPaceSecPerMile: number;
  minPaceSecPerMile: number;
  maxPaceSecPerMile: number;
}

export interface GroupTrend {
  groupId: string;
  groupName: string;
  dataYear: number;
  points: GroupTrendPoint[];
}

export interface SeasonCaptain {
  athleteId: string;
  name: string;
  gender: string | null;
  grade: number | null;
  /** Set when this captain already has an active membership in a CAPTAIN-type group this season. */
  existingGroup: { id: string; name: string } | null;
}

export interface XTrainingMember {
  athleteId: string;
  name: string;
  reason: string | null;
  since: string;
  /** When this stint expires on its own — always set (a bounded assignment), never null. */
  until: string;
  /** The training group they'll return to — null if they somehow have none right now. */
  trainingGroup: { id: string; name: string } | null;
}

export interface XTrainingRoster {
  /** Null until the first athlete is ever sent to cross-training this season — the group is auto-created on first use. */
  group: { id: string; name: string } | null;
  members: XTrainingMember[];
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

  async getMyGroups(): Promise<MyGroup[]> {
    const response = await api.get<{ groups: MyGroup[] }>('/groups/me');
    return response.data.groups;
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

  /**
   * Filter/compare groups' current rosters, normalized to pace. `seasonId`
   * picks which season's Group rows define the roster (always the season
   * being actively managed — usually the current one); `dataYear` picks
   * which year of results to show for that fixed roster, independent of
   * `seasonId` — pass a past year to see what today's roster did back
   * then, no Season row required for that past year. Omit `dataYear` for
   * "the roster season's own year" (the live/preseason case, with
   * per-athlete prior-season fallback). Omit groupIds for "all training
   * groups this season."
   */
  async getGroupAnalytics(seasonId: string, groupIds: string[] = [], dataYear?: number): Promise<GroupAnalytics[]> {
    const response = await api.get<GroupAnalytics[]>('/groups/analytics', {
      params: {
        seasonId,
        ...(groupIds.length > 0 ? { groupIds: groupIds.join(',') } : {}),
        ...(dataYear !== undefined ? { dataYear } : {}),
      },
    });
    return response.data;
  },

  /** Meet-by-meet pace trend and spread for one group, for the "explore" chart. Omit dataYear for the group's own season year. */
  async getGroupTrend(groupId: string, dataYear?: number): Promise<GroupTrend> {
    const response = await api.get<GroupTrend>(`/groups/${groupId}/trend`, {
      params: dataYear !== undefined ? { dataYear } : {},
    });
    return response.data;
  },

  /** This season's designated captains — for the "New Group" dialog's captain picker. */
  async listCaptains(seasonId: string): Promise<SeasonCaptain[]> {
    const response = await api.get<SeasonCaptain[]>('/groups/captains', { params: { seasonId } });
    return response.data;
  },

  /** Who's actually in cross-training today, and why — not the group's full history. */
  async getXTrainingRoster(seasonId: string): Promise<XTrainingRoster> {
    const response = await api.get<XTrainingRoster>(`/groups/x-training/${seasonId}`);
    return response.data;
  },

  /** Sends one athlete to cross-training for `days` (1 = today only), starting today. Authorized like leading their current training group. */
  async sendToXTraining(input: { athleteId: string; seasonId: string; days: number; reason: string }): Promise<void> {
    await api.post('/groups/x-training', input);
  },
};

/** Fastest (lowest) recorded time this season, or null if the athlete hasn't raced yet. */
export function seasonBestTime(athlete: RosterAthleteWithRaces): number | null {
  const times = athlete.races.map((r) => r.time).filter((t): t is number => typeof t === 'number' && t > 0);
  return times.length > 0 ? Math.min(...times) : null;
}

/** Fastest (lowest) pace per mile this season, distance-normalized across races — safe for
 * ranking a roster fastest-to-slowest, unlike seasonBestTime's raw finish time which isn't
 * comparable across different race distances. */
export function bestPaceSecPerMile(athlete: RosterAthleteWithRaces): number | null {
  const paces = athlete.races
    .filter(
      (r): r is { time: number; race: { date: string; distanceMeters: number } } =>
        typeof r.time === 'number' && r.time > 0 && typeof r.race.distanceMeters === 'number' && r.race.distanceMeters > 0
    )
    .map((r) => r.time / (r.race.distanceMeters / 1609.34));
  return paces.length > 0 ? Math.min(...paces) : null;
}

export function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
