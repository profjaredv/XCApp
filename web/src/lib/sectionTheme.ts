// A colour identity per area of the app, so a coach glancing at a phone
// knows what kind of screen they're on before reading a word: athlete
// screens are violet, group screens teal, the schedule amber, meets rose,
// analytics sky, admin/setup neutral.
//
// Rules this follows, so it stays subtle rather than becoming decoration:
//
// - The colour is a WASH behind the page header only (a gradient fading to
//   transparent), never a filled block and never behind body content. At
//   these alphas it reads as a tint on the page's own background rather
//   than a colour of its own, which is what keeps it working in both light
//   and dark mode without a second palette.
// - Every value is an alpha over the existing background (`/10`, `/70`),
//   so it composes with whatever `--background` is instead of hardcoding a
//   light-mode colour that would glow in dark mode.
// - Nothing here is ever the only carrier of meaning — it's a secondary
//   cue on top of the title and icon that were already there. A coach who
//   can't distinguish teal from sky loses nothing.
// - Deliberately NOT reused from the attendance status palette
//   (emerald/amber/blue in lib/attendanceStatus.ts). Those hues mean
//   "present/excused/late" inside a screen; these mean "which screen".
//   Section washes sit at /10 behind a header and never overlap a status
//   control, but the two vocabularies stay separate on purpose.

export type SectionKey = 'home' | 'athlete' | 'groups' | 'schedule' | 'meets' | 'analytics' | 'admin';

export interface SectionTheme {
  key: SectionKey;
  label: string;
  /** Gradient wash for the header band — fades to transparent into the page. */
  wash: string;
  /** Solid-ish accent for a thin top rule; the same hue at full strength. */
  rule: string;
}

export const SECTION_THEME: Record<SectionKey, SectionTheme> = {
  home: {
    key: 'home',
    label: 'Today',
    wash: 'from-slate-500/10',
    rule: 'bg-slate-500/70',
  },
  athlete: {
    key: 'athlete',
    label: 'Athlete',
    wash: 'from-violet-500/10',
    rule: 'bg-violet-500/70',
  },
  groups: {
    key: 'groups',
    label: 'Groups',
    wash: 'from-teal-500/10',
    rule: 'bg-teal-500/70',
  },
  schedule: {
    key: 'schedule',
    label: 'Schedule',
    wash: 'from-amber-500/10',
    rule: 'bg-amber-500/70',
  },
  meets: {
    key: 'meets',
    label: 'Meets',
    wash: 'from-rose-500/10',
    rule: 'bg-rose-500/70',
  },
  analytics: {
    key: 'analytics',
    label: 'Analytics',
    wash: 'from-sky-500/10',
    rule: 'bg-sky-500/70',
  },
  // Deliberately uncoloured. Settings/data/billing are chrome rather than
  // a place you do the work, and a 375px screenshot showed zinc sitting
  // next to `home`'s slate as two indistinguishable greys — which defeats
  // the point of the scheme. "No wash" is itself the signal here.
  admin: {
    key: 'admin',
    label: 'Setup',
    wash: 'from-transparent',
    rule: 'bg-border',
  },
};

// First segment wins, so `athlete/:id/journey` and `athlete/:id` are both
// "athlete". Anything unrecognized falls back to `home` rather than going
// uncoloured, so a new route never renders a bare header by accident.
const SECTION_BY_SUBPATH: Record<string, SectionKey> = {
  '': 'home',
  today: 'home',
  me: 'athlete',
  athlete: 'athlete',
  team: 'athlete', // team/athlete/:id — a coach looking at one athlete
  roster: 'athlete',
  groups: 'groups',
  schedule: 'schedule',
  'practice-plans': 'schedule',
  attendance: 'schedule',
  'interval-sessions': 'schedule',
  meets: 'meets',
  meet: 'meets',
  race: 'meets',
  'race-visualization': 'meets',
  'field-results': 'meets',
  'results-grid': 'analytics',
  analytics: 'analytics',
  'band-trends': 'analytics',
  tools: 'analytics',
  'coaches-tools': 'analytics',
  equipment: 'admin',
  settings: 'admin',
  'data-management': 'admin',
  feedback: 'admin',
  checkout: 'admin',
  profile: 'admin',
};

/**
 * The section for a full pathname, team prefix and all — e.g.
 * "/t/12345/athlete/abc/journey" -> 'athlete'.
 */
export function sectionForPath(pathname: string): SectionTheme {
  const parts = pathname.split('/').filter(Boolean);
  // Strip the /t/:athleticTeamId prefix when present.
  const rest = parts[0] === 't' ? parts.slice(2) : parts;
  const head = rest[0] ?? '';
  return SECTION_THEME[SECTION_BY_SUBPATH[head] ?? 'home'];
}

// Top-level destinations reachable from the sidebar. Anything else is a
// drill-in (a meet, an athlete, a checkout flow) and therefore wants a Back
// affordance — on a phone the sidebar is behind a hamburger, so without one
// the only way out of a detail page is the browser's own back gesture,
// which doesn't exist in an installed PWA.
const TOP_LEVEL_SUBPATHS = new Set([
  '',
  'today',
  'roster',
  'groups',
  'schedule',
  'meets',
  'band-trends',
  'analytics',
  'me',
  'equipment',
  'settings',
  'feedback',
  'data-management',
  'coaches-tools',
  'field-results',
]);

export function isDrillInPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  const rest = parts[0] === 't' ? parts.slice(2) : parts;
  if (rest.length === 0) return false;
  // A known top-level subpath with nothing after it is not a drill-in;
  // the same subpath with an id after it (meets -> meet/:id) is.
  return !(rest.length === 1 && TOP_LEVEL_SUBPATHS.has(rest[0]));
}
