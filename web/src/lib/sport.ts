import type { ComponentType } from 'react';
import { Home, Medal, TrendingUp, BarChart3, Flag, Upload, ClipboardList, Users, CalendarDays, Package, Camera } from 'lucide-react';
import type { TeamFeatureKey } from './teamFeatureKeys';

// One team, two sports. The sport is chosen at the top of the nav, and
// everything under it belongs to that sport alone: cross country and track
// & field keep different stats, so they get different screens, not one
// shared set with the other sport tucked inside it.
//
// Which sport you are in follows from where you are. Every track screen
// lives under /track; every other team screen is cross country. A few
// screens belong to neither (settings, your profile), and those keep
// whichever sport you were last in.

export type Sport = 'XC' | 'TRACK';

export const SPORT_LABEL: Record<Sport, string> = { XC: 'Cross Country', TRACK: 'Track & Field' };
export const SPORT_SHORT: Record<Sport, string> = { XC: 'XC', TRACK: 'Track' };
/** Where switching to a sport lands, appended to /t/:teamSlug. */
export const SPORT_HOME: Record<Sport, string> = { XC: '/today', TRACK: '/track' };
/** Track's nav screens, for the header's back button (everything else under /track is a drill-in). */

const NEUTRAL = ['settings', 'profile', 'admin', 'feedback'];
const STORAGE_KEY = 'leadpack.sport';

/** `sub` is the path after /t/:teamSlug/, e.g. "track/leaders" or "roster". */
export function sportForSubpath(sub: string, stored: Sport): Sport {
  const first = sub.split('/')[0];
  if (first === 'track') return 'TRACK';
  if (NEUTRAL.includes(first)) return stored;
  return 'XC';
}

export function teamSubpath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 't' ? parts.slice(2).join('/') : parts.join('/');
}

/**
 * The sport of the page the browser is on, from the address alone. This is
 * what API requests and the query cache go by: a screen under /track is
 * about the team's track seasons, everything else about cross country.
 */
// A coach whose staff access covers one sport only is always in that
// sport, whatever screen they are on (set from the signed-in user by
// AuthProvider). Null for everyone else.
let onlySport: Sport | null = null;
export function setOnlySport(sport: Sport | null): void {
  onlySport = sport;
}
export function getOnlySport(): Sport | null {
  return onlySport;
}

export function sportOfLocation(pathname: string = typeof window === 'undefined' ? '' : window.location.pathname): Sport {
  if (onlySport) return onlySport;
  return teamSubpath(pathname).split('/')[0] === 'track' ? 'TRACK' : 'XC';
}

/**
 * Where a team link should go given the sport you are in. Inside Track &
 * Field, the screens both sports have (roster, groups, schedule...) live
 * under /track, so a link written as "/roster" stays in track. Screens that
 * belong to neither sport, and links already under /track, are left alone.
 */
export function sportSubpath(subpath: string, sport: Sport): string {
  const suffix = subpath.startsWith('/') ? subpath : `/${subpath}`;
  if (sport !== 'TRACK') return suffix;
  const first = suffix.split(/[/?#]/)[1] ?? '';
  if (first === 'track' || NEUTRAL.includes(first)) return suffix;
  return `/track${suffix}`;
}

export function readStoredSport(): Sport {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'TRACK' ? 'TRACK' : 'XC';
  } catch {
    return 'XC';
  }
}

export function writeStoredSport(sport: Sport): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, sport);
  } catch {
    // Private mode: the sport still follows the URL, it just isn't remembered on neutral screens.
  }
}

export interface TrackNavEntry {
  key: string;
  label: string;
  /** Appended to /t/:teamSlug. */
  path: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  zone: 'season' | 'setup';
  /** Position in the phone tab bar; the rest go under More. */
  mobileTab?: number;
  feature?: TeamFeatureKey;
}

// The whole Track & Field nav. Coaches only (the API refuses everyone
// else). The same spine as cross country (athletes, groups, practice,
// meets) plus Events, the thing track is organised around.
export const TRACK_NAV: TrackNavEntry[] = [
  { key: 'home', label: 'Today', path: '/track', icon: Home, zone: 'season' },
  { key: 'roster', label: 'Roster', path: '/track/roster', icon: ClipboardList, zone: 'season', mobileTab: 1 },
  { key: 'groups', label: 'Groups', path: '/track/groups', icon: Users, zone: 'season', mobileTab: 2 },
  { key: 'schedule', label: 'Schedule', path: '/track/schedule', icon: CalendarDays, zone: 'season', mobileTab: 3 },
  { key: 'meets', label: 'Meets', path: '/track/meets', icon: Flag, zone: 'season' },
  { key: 'events', label: 'Events', path: '/track/events', icon: Medal, zone: 'season', mobileTab: 4 },
  { key: 'points', label: 'Points', path: '/track/points', icon: BarChart3, zone: 'season' },
  { key: 'program', label: 'Program', path: '/track/program', icon: TrendingUp, zone: 'season' },
  { key: 'import', label: 'Import results', path: '/track/import', icon: Upload, zone: 'setup' },
  { key: 'equipment', label: 'Equipment', path: '/track/equipment', icon: Package, zone: 'setup', feature: 'equipment' },
  { key: 'photos', label: 'Photos', path: '/track/photos', icon: Camera, zone: 'setup', feature: 'photos' },
];

export function trackNavActive(entry: TrackNavEntry, sub: string): boolean {
  const target = entry.path.replace(/^\//, '');
  if (entry.key === 'events') return sub === target;
  if (entry.key === 'roster') return sub === target || sub.startsWith('track/athlete/');
  if (entry.key === 'groups') return sub === target || sub.startsWith('track/group');
  if (entry.key === 'meets') return sub === target || sub.startsWith('track/meet/');
  return sub === target;
}
