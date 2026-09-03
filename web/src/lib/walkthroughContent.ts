import { navEntry, type NavEntry } from './navigation';

export type WalkthroughRole = 'coach' | 'athlete';

/** What a step says. Where it goes and what it is called come from the nav. */
interface StepCopy {
  navKey: string;
  description: string;
  cta: string;
}

export interface WalkthroughStep extends StepCopy {
  title: NavEntry['label'];
  path: NavEntry['path'];
  icon: NavEntry['icon'];
}

// The tour walks the sidebar, in sidebar order, using the sidebar's own
// words. Only the description and button text are written here — the title,
// the icon and the destination all come from lib/navigation.ts.
//
// That is deliberate, and it is the fix for how this went wrong before. The
// old tour sent coaches to an "Analytics" screen the sidebar calls
// "Season"; four of the five ATHLETE
// steps pointed at screens that are not in an athlete's sidebar at all
// (Analytics, Results Grid, Pace Calculator, Roster). Every one of those
// was right when written. Teaching someone vocabulary the app does not use
// is worse than not touring at all, so the two now share one source.

const COACH_STEPS: StepCopy[] = [
  {
    navKey: 'today',
    description:
      "Where you land. Today's practice, who is expected, and what is coming up — the screen to open at the track, not a dashboard to study.",
    cta: 'Open Today',
  },
  {
    navKey: 'athletes',
    description:
      'Your roster, season by season. Add athletes, invite them to their own login, mark captains, and merge duplicates when a scrape brings the same runner in twice.',
    cta: 'Open Roster',
  },
  {
    navKey: 'groups',
    description:
      'Training groups, captains’ groups, and cross training. An athlete can be in more than one, and their profile shows every group they belong to.',
    cta: 'Open Groups',
  },
  {
    navKey: 'schedule',
    description:
      'The calendar of practices and meets. Attendance, interval sessions and practice plans all hang off a day here — start from the date, not from a menu.',
    cta: 'Open Schedule',
  },
  {
    navKey: 'season',
    description:
      'This season’s analysis, split into tabs: the dashboard, athletes, meets, performance, by group, the results grid, the pace calculator and coach insights.',
    cta: 'Open Season',
  },
  {
    navKey: 'postseason',
    description:
      'The same questions, asked only of the races at the end of the year: who got out of districts, who ran at state, and whether they ran their best race when it counted. Tag your championship meets here and it fills in.',
    cta: 'Open Post Season',
  },
  {
    navKey: 'program',
    description:
      'The long view — how each ability band has moved across seasons, so you can see whether the program is improving, not just this year’s team.',
    cta: 'Open Program',
  },
  {
    navKey: 'settings',
    description:
      'Under Setup. Define what your team’s pace terms mean, invite staff, and download everything you have ever entered. Your data is yours, any time.',
    cta: 'Open Settings',
  },
];

const ATHLETE_STEPS: StepCopy[] = [
  {
    navKey: 'today',
    description: "What is on today — practice, the workout, and where to be.",
    cta: 'Open Today',
  },
  {
    navKey: 'my-progress',
    description:
      'Your races, your splits, and your training paces worked out from your most recent result. You can log a run here too.',
    cta: 'Open My Progress',
  },
  {
    navKey: 'my-group',
    description:
      'Which training group you are in, who leads it, and who else is in it.',
    cta: 'Open My Group',
  },
  {
    navKey: 'meets',
    description: 'The meet schedule, and your results once they are in.',
    cta: 'Open Meets',
  },
];

function build(steps: StepCopy[]): WalkthroughStep[] {
  return steps.map((step) => {
    const entry = navEntry(step.navKey);
    return { ...step, title: entry.label, path: entry.path, icon: entry.icon };
  });
}

export const WALKTHROUGH_STEPS: Record<WalkthroughRole, WalkthroughStep[]> = {
  coach: build(COACH_STEPS),
  athlete: build(ATHLETE_STEPS),
};
