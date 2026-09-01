// Which colour belongs to which part of the app.
//
// The point is wayfinding, not decoration: a coach who lands on a page
// should know where they are before reading the heading, and the sidebar,
// the page header and the cards on that page should agree. So the mapping
// lives here once rather than as a colour typed into each page.
//
// Six accents, assigned by domain and then held fixed. They are never
// cycled or reassigned by position — "Athletes is blue" has to stay true
// across every screen or the whole idea stops working.
//
// The palette itself (and why these six survive a colour-vision check)
// is documented in index.css.

export type SectionKey =
  | 'season'
  | 'athletes'
  | 'meets'
  | 'groups'
  | 'training'
  | 'program'
  | 'neutral';

export interface AccentClasses {
  /** Solid fill — the icon tile, the rail down a page header. */
  bg: string;
  /** Tinted block behind content. */
  soft: string;
  /** The accent as text or an icon on a light surface. */
  text: string;
  /** A hairline in the accent, for card tops and dividers. */
  border: string;
  /** Text or icon colour to use ON `bg`. Never assume white — one of the
   *  light-mode fills is too light for it. */
  on: string;
  /** Left rail on a list row or header. */
  rail: string;
}

// Written out rather than built by template string: Tailwind scans source
// for complete class names, and `bg-accent-${key}` would compile to
// nothing at all.
const ACCENTS: Record<SectionKey, AccentClasses> = {
  season: {
    bg: 'bg-accent-season',
    soft: 'bg-accent-season-soft',
    text: 'text-accent-season',
    border: 'border-accent-season',
    on: 'text-accent-season-on',
    rail: 'bg-accent-season',
  },
  athletes: {
    bg: 'bg-accent-athletes',
    soft: 'bg-accent-athletes-soft',
    text: 'text-accent-athletes',
    border: 'border-accent-athletes',
    on: 'text-accent-athletes-on',
    rail: 'bg-accent-athletes',
  },
  meets: {
    bg: 'bg-accent-meets',
    soft: 'bg-accent-meets-soft',
    text: 'text-accent-meets',
    border: 'border-accent-meets',
    on: 'text-accent-meets-on',
    rail: 'bg-accent-meets',
  },
  groups: {
    bg: 'bg-accent-groups',
    soft: 'bg-accent-groups-soft',
    text: 'text-accent-groups',
    border: 'border-accent-groups',
    on: 'text-accent-groups-on',
    rail: 'bg-accent-groups',
  },
  training: {
    bg: 'bg-accent-training',
    soft: 'bg-accent-training-soft',
    text: 'text-accent-training',
    border: 'border-accent-training',
    on: 'text-accent-training-on',
    rail: 'bg-accent-training',
  },
  program: {
    bg: 'bg-accent-program',
    soft: 'bg-accent-program-soft',
    text: 'text-accent-program',
    border: 'border-accent-program',
    on: 'text-accent-program-on',
    rail: 'bg-accent-program',
  },
  // For screens that belong to no section — settings, admin, policies.
  // Deliberately the brand colour rather than a seventh hue: adding one
  // would push the palette past what the colour-vision check clears.
  neutral: {
    bg: 'bg-primary',
    soft: 'bg-secondary',
    text: 'text-primary',
    border: 'border-primary',
    on: 'text-primary-foreground',
    rail: 'bg-primary',
  },
};

export function accentFor(section: SectionKey): AccentClasses {
  return ACCENTS[section] ?? ACCENTS.neutral;
}

/** Nav key (see lib/navigation.ts) -> section. Keys not listed here are
 *  neutral, which is the right answer for Settings and the admin pages. */
const NAV_SECTION: Record<string, SectionKey> = {
  today: 'season',
  athletes: 'athletes',
  groups: 'groups',
  schedule: 'meets',
  season: 'season',
  program: 'program',
  'my-progress': 'training',
  'my-group': 'groups',
  meets: 'meets',
  data: 'neutral',
  equipment: 'neutral',
  'field-results': 'meets',
  settings: 'neutral',
};

export function sectionForNavKey(key: string): SectionKey {
  return NAV_SECTION[key] ?? 'neutral';
}

export const SECTION_KEYS: SectionKey[] = [
  'season', 'athletes', 'meets', 'groups', 'training', 'program', 'neutral',
];
