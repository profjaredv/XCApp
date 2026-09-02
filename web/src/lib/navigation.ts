import type { ComponentType } from 'react';
import type { TeamFeatureKey } from './teamFeatureKeys';
import {
  Home, ClipboardList, Users, CalendarDays, LayoutDashboard, TrendingUp,
  Database, Package, Upload, Settings, Gauge, Flag,
} from 'lucide-react';

// The sidebar spine, as data.
//
// It exists as data because the feature tour kept drifting from it. The
// tour used to name an "Analytics" screen the sidebar calls "Season", a
// the sidebar and the route now agree ("Roster", /roster), and — for athletes — four screens
// that are not in their sidebar at all. Every one of those was correct when
// it was written. Nothing tied them together, so nothing caught it when the
// nav moved.
//
// Now the tour is BUILT from this list (lib/walkthroughContent.ts) and
// Layout RENDERS from it, so a step cannot name a screen that isn't there
// or call it something the sidebar doesn't. navigation.test.ts checks the
// remaining seam.

export type NavAudience = 'coach' | 'athlete';

export interface NavEntry {
  key: string;
  /** Exactly what the sidebar shows. The tour reuses it verbatim. */
  label: string;
  /** Appended to /t/:athleticTeamId. */
  path: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  audience: NavAudience[];
  /**
   * 'spine' is the main list; 'setup' is the collapsed section at the
   * bottom, which volunteer coaches don't get.
   */
  section: 'spine' | 'setup';
  /**
   * Rendered by its own component rather than a plain link — Season is a
   * collapsible group of Analytics tabs. Still a real destination, so the
   * tour can point at it.
   */
  custom?: boolean;
  /**
   * Hidden when the team turned this feature off (see lib/teamFeatures.js
   * on the backend). Only the app's edges carry one — an entry with no
   * feature is part of what LeadPack is and can't be switched off.
   */
  feature?: TeamFeatureKey;
}

// Order matters: this is the order the sidebar shows, and the order the
// tour walks. The spine was designed as a hierarchy — an athlete belongs to
// a group, a group trains at practice, practices build toward a meet, meets
// make a season, seasons make a program — so walking it in order is also
// the right order to explain the app in.
export const NAV_ITEMS: NavEntry[] = [
  { key: 'today', label: 'Today', path: '/today', icon: Home, audience: ['coach', 'athlete'], section: 'spine' },

  { key: 'athletes', label: 'Roster', path: '/roster', icon: ClipboardList, audience: ['coach'], section: 'spine' },
  { key: 'groups', label: 'Groups', path: '/groups', icon: Users, audience: ['coach'], section: 'spine' },
  { key: 'schedule', label: 'Schedule', path: '/schedule', icon: CalendarDays, audience: ['coach'], section: 'spine' },
  { key: 'season', label: 'Season', path: '/analytics', icon: LayoutDashboard, audience: ['coach'], section: 'spine', custom: true },
  { key: 'program', label: 'Program', path: '/band-trends', icon: TrendingUp, audience: ['coach'], section: 'spine' },

  { key: 'data', label: 'Data & Import', path: '/data-management', icon: Database, audience: ['coach'], section: 'setup' },
  { key: 'equipment', label: 'Equipment', path: '/equipment', icon: Package, audience: ['coach'], section: 'setup', feature: 'equipment' },
  { key: 'field-results', label: 'Field Results', path: '/field-results', icon: Upload, audience: ['coach'], section: 'setup', feature: 'fieldResults' },
  { key: 'settings', label: 'Settings', path: '/settings', icon: Settings, audience: ['coach'], section: 'setup' },

  { key: 'my-progress', label: 'My Progress', path: '/me', icon: Gauge, audience: ['athlete'], section: 'spine' },
  { key: 'my-group', label: 'My Group', path: '/groups', icon: Users, audience: ['athlete'], section: 'spine' },
  { key: 'meets', label: 'Meets', path: '/meets', icon: Flag, audience: ['athlete'], section: 'spine' },
];

export function navFor(audience: NavAudience, section: NavEntry['section']): NavEntry[] {
  return NAV_ITEMS.filter((i) => i.audience.includes(audience) && i.section === section);
}

export function navEntry(key: string): NavEntry {
  const found = NAV_ITEMS.find((i) => i.key === key);
  if (!found) throw new Error(`Unknown nav item "${key}"`);
  return found;
}
