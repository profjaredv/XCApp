import type { ComponentType } from 'react';
import { Medal, BarChart3, Flag, Upload } from 'lucide-react';

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
}

// The whole Track & Field nav. Coaches only (the API refuses everyone else).
export const TRACK_NAV: TrackNavEntry[] = [
  { key: 'leaders', label: 'Leaders', path: '/track/leaders', icon: Medal, zone: 'season' },
  { key: 'points', label: 'Points', path: '/track/points', icon: BarChart3, zone: 'season' },
  { key: 'meets', label: 'Meets', path: '/track/meets', icon: Flag, zone: 'season' },
  { key: 'import', label: 'Import results', path: '/track/import', icon: Upload, zone: 'setup' },
];

export function trackNavActive(entry: TrackNavEntry, sub: string): boolean {
  const target = entry.path.replace(/^\//, '');
  if (entry.key === 'leaders') return sub === target || sub.startsWith('track/athlete/');
  return sub === target;
}
