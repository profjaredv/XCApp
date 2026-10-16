import type { RosterAthlete } from '@/api/rosterService';
import type { Group, GroupMember } from '@/api/groupService';
import type { Athlete as AnalyticsAthlete } from '@/types/analytics';

// The next shell's Athletes list (docs/leadpack-new-ui-trial.md §4.4).
// The roster is the spine — every rostered athlete is a row whether or not
// they've raced — and the Season → Athletes metrics are joined on by id.
// Pure, so the join is tested without a server.

export interface AthleteListRow {
  id: string;
  /** What they go by. */
  name: string;
  /** Legal name, kept for search. */
  legalName: string;
  athleticAthleteId: string | null;
  gender: string | null;
  grade: number | null;
  isCaptain: boolean;
  onRoster: boolean;
  /** Training groups first, then the rest. Never the cross-training group. */
  groups: Array<{ id: string; name: string; type: Group['type'] }>;
  /** Season-best and all-time 5K — 5K only, null when there isn't one (F5). */
  sb: number | null;
  pr: number | null;
  races: number;
  /** First race to latest race this season, % (positive = faster); null when not computed. */
  trend: number | null;
}

const TYPE_RANK: Record<string, number> = { TRAINING: 0, CAPTAIN: 1, CUSTOM: 2 };

export function buildAthleteRows(
  roster: RosterAthlete[],
  metrics: Pick<AnalyticsAthlete, 'id' | 'bestTime' | 'prBest5K' | 'improvementPercent' | 'raceCount'>[],
  groups: Group[],
  membersByGroup: Record<string, GroupMember[]>
): AthleteListRow[] {
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const groupsByAthlete = new Map<string, AthleteListRow['groups']>();
  for (const g of groups) {
    if (g.archived || g.type === 'X_TRAINING') continue;
    for (const m of membersByGroup[g.id] ?? []) {
      const list = groupsByAthlete.get(m.athleteId) ?? [];
      list.push({ id: g.id, name: g.name, type: g.type });
      groupsByAthlete.set(m.athleteId, list);
    }
  }
  return roster.map((a) => {
    const m = metricById.get(a.id);
    const sb = m?.bestTime && m.bestTime > 0 ? m.bestTime : null;
    const pr = m?.prBest5K && m.prBest5K > 0 ? m.prBest5K : sb;
    return {
      id: a.id,
      name: a.preferredName || a.name,
      legalName: a.name,
      athleticAthleteId: a.athleticAthleteId ?? null,
      gender: a.gender ?? null,
      grade: a.grade,
      isCaptain: !!a.isCaptain,
      onRoster: a.onRoster,
      groups: (groupsByAthlete.get(a.id) ?? []).sort((x, y) => (TYPE_RANK[x.type] ?? 9) - (TYPE_RANK[y.type] ?? 9)),
      sb,
      pr,
      races: a.raceCount ?? m?.raceCount ?? 0,
      // A trend needs at least two races to mean anything.
      trend: m && (a.raceCount ?? 0) >= 2 ? m.improvementPercent : null,
    };
  });
}

export type AthleteSort = 'name' | 'sb';

export function sortAthleteRows(rows: AthleteListRow[], sort: AthleteSort): AthleteListRow[] {
  const byName = (a: AthleteListRow, b: AthleteListRow) => a.name.localeCompare(b.name);
  if (sort === 'name') return [...rows].sort(byName);
  // Fastest first; anyone without a 5K after everyone with one, by name.
  return [...rows].sort((a, b) => {
    if (a.sb == null && b.sb == null) return byName(a, b);
    if (a.sb == null) return 1;
    if (b.sb == null) return -1;
    return a.sb - b.sb;
  });
}
