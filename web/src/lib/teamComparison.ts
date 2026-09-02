import { gradeLabel } from './seasonUtils';

// Picking who an athlete gets compared against.
//
// An athlete's numbers on their own don't answer the question a coach (or
// the athlete) is actually asking: is 7:42/mi good here? The team already
// computes group averages every time season metrics are calculated
// (TeamSeasonMetrics.byGender / byGradeGender, see
// services/performance/calculationService.js) — nothing was ever showing
// them next to the athlete.
//
// Two rules decide the peer group:
//
//   1. Never average boys and girls together. Cross-country times differ
//      systematically by sex, so a mixed "team average" tells an athlete
//      mostly which one they are.
//   2. Never call two people an average. A group of one IS the athlete —
//      the comparison would read "0:00 off the average" forever — and a
//      group of two is one teammate wearing a statistic's clothes.
//
// Grade-and-gender is the sharper comparison when the squad is big enough
// to have one; otherwise the whole gender group; otherwise nothing, and
// the card doesn't render.

/** The shape _calculateGroupStats returns for every breakdown bucket. */
export interface GroupStats {
  count: number;
  avgPace: number;
  bestTime?: number;
  avgTime?: number;
  totalRaces?: number;
}

export interface TeamMetricsLike {
  totalAthletes?: number;
  avgMilePace?: { overall: number };
  byGender?: { men?: GroupStats; women?: GroupStats };
  byGradeGender?: Record<string, { M?: GroupStats; F?: GroupStats } | undefined>;
}

export interface PeerGroup {
  /** How the group reads in a sentence: "the junior girls", "the boys". */
  label: string;
  count: number;
  avgPace: number;
  /** Races per athlete in the group — null when the bucket didn't carry it. */
  avgRaces: number | null;
}

/** Below this a group average is one or two people, which is not an average. */
export const MIN_PEER_GROUP = 3;

function genderWord(gender: 'M' | 'F'): string {
  return gender === 'M' ? 'boys' : 'girls';
}

function toPeerGroup(stats: GroupStats | undefined, label: string): PeerGroup | null {
  if (!stats) return null;
  if (!Number.isFinite(stats.count) || stats.count < MIN_PEER_GROUP) return null;
  if (!Number.isFinite(stats.avgPace) || stats.avgPace <= 0) return null;
  const totalRaces = stats.totalRaces;
  return {
    label,
    count: stats.count,
    avgPace: stats.avgPace,
    avgRaces:
      Number.isFinite(totalRaces) && (totalRaces as number) > 0 ? (totalRaces as number) / stats.count : null,
  };
}

export function pickPeerGroup(
  team: TeamMetricsLike | null | undefined,
  gender: 'M' | 'F' | null | undefined,
  grade: number | null | undefined
): PeerGroup | null {
  if (!team) return null;

  if (gender) {
    if (Number.isFinite(grade)) {
      const bucket = team.byGradeGender?.[`grade${grade}`];
      const sameGradeAndGender = toPeerGroup(
        bucket?.[gender],
        `the ${gradeLabel(grade).toLowerCase()} ${genderWord(gender)}`
      );
      if (sameGradeAndGender) return sameGradeAndGender;
    }

    const sameGender = toPeerGroup(
      gender === 'M' ? team.byGender?.men : team.byGender?.women,
      `the ${genderWord(gender)}`
    );
    if (sameGender) return sameGender;
  }

  // No gender on file. The whole-team average mixes boys and girls, so it
  // is the last resort rather than the default — but it still beats an
  // athlete having no idea where they sit.
  return toPeerGroup(
    {
      count: team.totalAthletes ?? 0,
      avgPace: team.avgMilePace?.overall ?? 0,
    },
    'the team'
  );
}

export interface PaceGap {
  /** Absolute difference in seconds per mile. */
  seconds: number;
  /** True when the athlete's pace is the faster one. */
  faster: boolean;
}

/** Positive-magnitude gap between an athlete's pace and their group's. Null when either is missing. */
export function paceGap(athletePace: number, peerPace: number): PaceGap | null {
  if (!Number.isFinite(athletePace) || athletePace <= 0) return null;
  if (!Number.isFinite(peerPace) || peerPace <= 0) return null;
  return { seconds: Math.abs(peerPace - athletePace), faster: athletePace < peerPace };
}
