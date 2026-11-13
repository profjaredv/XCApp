import { describe, expect, it } from 'vitest';
import { NEXT_NAV } from './navigationNext';
import { NAV_ITEMS } from './navigation';
import { isDrillInPath } from './sectionTheme';
import { sportForSubpath, sportOfLocation, sportSubpath, teamSubpath, TRACK_NAV, trackNavActive } from './sport';

describe('sportForSubpath', () => {
  it('is track on every /track screen and cross country on every other team screen', () => {
    expect(sportForSubpath('track', 'XC')).toBe('TRACK');
    expect(sportForSubpath('track/leaders', 'XC')).toBe('TRACK');
    expect(sportForSubpath('track/athlete/abc', 'XC')).toBe('TRACK');
    expect(sportForSubpath('today', 'TRACK')).toBe('XC');
    expect(sportForSubpath('analytics', 'TRACK')).toBe('XC');
    expect(sportForSubpath('', 'TRACK')).toBe('XC');
  });
  it('keeps the last sport on screens that belong to neither', () => {
    expect(sportForSubpath('settings', 'TRACK')).toBe('TRACK');
    expect(sportForSubpath('settings', 'XC')).toBe('XC');
    expect(sportForSubpath('profile', 'TRACK')).toBe('TRACK');
  });
  it('reads the part after the team address', () => {
    expect(teamSubpath('/t/ellensburg/track/leaders')).toBe('track/leaders');
    expect(teamSubpath('/profile')).toBe('profile');
  });
});

describe('the two sports do not share a nav', () => {
  it('no cross country nav list contains a track screen', () => {
    expect(NEXT_NAV.some((e) => e.path.startsWith('/track'))).toBe(false);
    expect(NAV_ITEMS.some((e) => e.path.startsWith('/track'))).toBe(false);
  });
  it('every track nav entry lives under /track', () => {
    expect(TRACK_NAV.every((e) => e.path.startsWith('/track/'))).toBe(true);
  });
  it('an athlete page keeps Roster lit, a group page keeps Groups lit', () => {
    const by = (k: string) => TRACK_NAV.find((e) => e.key === k)!;
    expect(trackNavActive(by('roster'), 'track/athlete/abc')).toBe(true);
    expect(trackNavActive(by('groups'), 'track/group/abc')).toBe(true);
    expect(trackNavActive(by('events'), 'track/points')).toBe(false);
  });
  it('carries the spine a coach asked for', () => {
    expect(TRACK_NAV.map((e) => e.label)).toEqual(['Roster', 'Groups', 'Schedule', 'Meets', 'Events', 'Points', 'Import results', 'Equipment', 'Photos']);
  });
});

describe('back button', () => {
  it('shows on a track athlete page, not on a track nav screen', () => {
    for (const e of TRACK_NAV) expect(isDrillInPath(`/t/team${e.path}`)).toBe(false);
    expect(isDrillInPath('/t/team/track/athlete/abc')).toBe(true);
    expect(isDrillInPath('/t/team/track/group/abc')).toBe(true);
  });
});

describe('links stay in the sport you are in', () => {
  it('cross country links are untouched', () => {
    expect(sportSubpath('/roster', 'XC')).toBe('/roster');
    expect(sportSubpath('roster', 'XC')).toBe('/roster');
  });
  it('in track, shared screens live under /track', () => {
    expect(sportSubpath('/roster', 'TRACK')).toBe('/track/roster');
    expect(sportSubpath('/group/abc?date=1', 'TRACK')).toBe('/track/group/abc?date=1');
  });
  it('in track, track links and neutral screens are left alone', () => {
    expect(sportSubpath('/track/events', 'TRACK')).toBe('/track/events');
    expect(sportSubpath('/settings#staff', 'TRACK')).toBe('/settings#staff');
    expect(sportSubpath('/profile', 'TRACK')).toBe('/profile');
  });
  it('the request sport comes from the address alone', () => {
    expect(sportOfLocation('/t/team/track/roster')).toBe('TRACK');
    expect(sportOfLocation('/t/team/roster')).toBe('XC');
    expect(sportOfLocation('/t/team/settings')).toBe('XC');
  });
});
