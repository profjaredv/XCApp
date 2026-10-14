import type { ComponentType } from 'react';
import type { TeamFeatureKey } from './teamFeatureKeys';
import type { User } from '@/types';
import {
  Home, Dumbbell, Users, UserSquare2, Flag, LayoutDashboard, TrendingUp,
  ClipboardList, Database, Package, Upload, Camera, Settings, UserCog, Gauge, Heart,
} from 'lucide-react';

// The "next" shell's nav, as data (docs/leadpack-new-ui-trial.md §3.6).
// Classic's lib/navigation.ts is untouched — that one also drives the
// feature tour, and classic must not change.
//
// Visibility follows the same rules classic uses: coaches by TeamMember
// role (volunteers get no Setup), athletes by having a linked athlete,
// team features switched off are hidden. All of it is tidiness — the
// server decides who can actually see or do anything.

export type NextNavRole = 'coach' | 'volunteer' | 'athlete' | 'parent' | 'none';

export type NextNavZone = 'week' | 'insights' | 'setup';

export interface NextNavEntry {
  key: string;
  label: string;
  /** Appended to /t/:athleticTeamId. */
  path: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  audience: NextNavRole[];
  zone: NextNavZone;
  /** Position in the phone tab bar for each role, or false = lives in "More". */
  mobileTab: Partial<Record<NextNavRole, number>> | false;
  feature?: TeamFeatureKey;
}

const COACHES: NextNavRole[] = ['coach', 'volunteer'];

export const NEXT_NAV: NextNavEntry[] = [
  // THIS WEEK
  { key: 'today', label: 'Today', path: '/today', icon: Home, audience: ['coach', 'volunteer', 'athlete', 'parent'], zone: 'week', mobileTab: { coach: 1, volunteer: 1, athlete: 1, parent: 1 } },
  { key: 'my-season', label: 'My Season', path: '/me', icon: Gauge, audience: ['athlete'], zone: 'week', mobileTab: { athlete: 2 } },
  { key: 'my-runner', label: 'My Runner', path: '/my-runner', icon: Heart, audience: ['parent'], zone: 'week', mobileTab: { parent: 2 } },
  { key: 'train', label: 'Train', path: '/train', icon: Dumbbell, audience: ['coach', 'volunteer', 'athlete'], zone: 'week', mobileTab: { coach: 2, volunteer: 2, athlete: 3 } },
  { key: 'groups', label: 'Groups', path: '/groups', icon: Users, audience: COACHES, zone: 'week', mobileTab: { coach: 3, volunteer: 3 } },

  // INSIGHTS
  { key: 'athletes', label: 'Athletes', path: '/athletes', icon: UserSquare2, audience: COACHES, zone: 'insights', mobileTab: false },
  { key: 'meets', label: 'Meets', path: '/meets', icon: Flag, audience: ['coach', 'volunteer', 'athlete', 'parent'], zone: 'insights', mobileTab: { coach: 4, volunteer: 4 } },
  { key: 'season', label: 'Season', path: '/season', icon: LayoutDashboard, audience: COACHES, zone: 'insights', mobileTab: false },
  { key: 'program', label: 'Program', path: '/band-trends', icon: TrendingUp, audience: COACHES, zone: 'insights', mobileTab: false },
  { key: 'photos', label: 'Photos', path: '/photos', icon: Camera, audience: ['athlete', 'parent'], zone: 'insights', mobileTab: { athlete: 4, parent: 3 }, feature: 'photos' },

  // SETUP (coaches only, never volunteers — as classic)
  { key: 'roster', label: 'Roster', path: '/roster', icon: ClipboardList, audience: ['coach'], zone: 'setup', mobileTab: false },
  { key: 'data', label: 'Data & Import', path: '/data-management', icon: Database, audience: ['coach'], zone: 'setup', mobileTab: false },
  { key: 'equipment', label: 'Equipment', path: '/equipment', icon: Package, audience: ['coach'], zone: 'setup', mobileTab: false, feature: 'equipment' },
  { key: 'field-results', label: 'Field Results', path: '/field-results', icon: Upload, audience: ['coach'], zone: 'setup', mobileTab: false, feature: 'fieldResults' },
  { key: 'setup-photos', label: 'Photos', path: '/photos', icon: Camera, audience: ['coach'], zone: 'setup', mobileTab: false, feature: 'photos' },
  { key: 'settings', label: 'Settings', path: '/settings', icon: Settings, audience: ['coach'], zone: 'setup', mobileTab: false },
  { key: 'staff', label: 'Coaching staff', path: '/settings#staff', icon: UserCog, audience: ['coach'], zone: 'setup', mobileTab: false },
];

/**
 * Which nav a user gets. Same signals classic's Layout reads: the
 * TeamMember role first, then a linked athlete. A guardian with neither is
 * "parent" only when the caller knows they hold an approved link.
 */
export function nextNavRole(user: User | null | undefined, opts: { isGuardian?: boolean } = {}): NextNavRole {
  const r = user?.teamRole;
  if (r === 'HEAD_COACH' || r === 'COACH') return 'coach';
  if (r === 'VOLUNTEER_COACH') return 'volunteer';
  if (user?.linkedAthlete) return 'athlete';
  if (opts.isGuardian) return 'parent';
  return 'none';
}

type Features = Partial<Record<TeamFeatureKey, boolean>> | undefined;

function visible(entry: NextNavEntry, role: NextNavRole, features: Features): boolean {
  if (!entry.audience.includes(role)) return false;
  return !entry.feature || features?.[entry.feature] !== false;
}

export function nextNavFor(role: NextNavRole, zone: NextNavZone, features?: Features): NextNavEntry[] {
  return NEXT_NAV.filter((e) => e.zone === zone && visible(e, role, features));
}

/** The phone tab bar, in order (the "More" tab is added by the shell). */
export function mobileTabsFor(role: NextNavRole, features?: Features): NextNavEntry[] {
  return NEXT_NAV.filter((e) => visible(e, role, features) && e.mobileTab && e.mobileTab[role] != null).sort(
    (a, b) => ((a.mobileTab as Record<string, number>)[role] ?? 0) - ((b.mobileTab as Record<string, number>)[role] ?? 0)
  );
}

/** Everything else, for the phone's "More" sheet — Setup last, as on desktop. */
export function moreItemsFor(role: NextNavRole, features?: Features): NextNavEntry[] {
  const tabs = new Set(mobileTabsFor(role, features).map((e) => e.key));
  const rest = NEXT_NAV.filter((e) => visible(e, role, features) && !tabs.has(e.key));
  return [...rest.filter((e) => e.zone !== 'setup'), ...rest.filter((e) => e.zone === 'setup')];
}
