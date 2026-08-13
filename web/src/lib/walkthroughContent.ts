import type { ComponentType } from 'react';
import { Gauge, Home, BarChart2, Calculator, ClipboardList, Users, CalendarDays, Flag } from 'lucide-react';

export type WalkthroughRole = 'coach' | 'athlete';

export interface WalkthroughStep {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  // Appended to /t/:athleticTeamId to build the "go there" link.
  path: string;
  cta: string;
}

// Five most important features per role, in the order a first-time user
// should meet them. Coach and athlete accounts see different sets — see
// WalkthroughContext for how the role is picked.
export const WALKTHROUGH_STEPS: Record<WalkthroughRole, WalkthroughStep[]> = {
  coach: [
    {
      icon: Home,
      title: 'Analytics',
      description: "Your team's home base — performance trends, PRs, and race results as soon as a season's data is imported.",
      path: '/analytics',
      cta: 'View Analytics',
    },
    {
      icon: ClipboardList,
      title: 'Roster',
      description: 'Manage your athletes, invite assistant or volunteer coaches, and mark team captains.',
      path: '/roster',
      cta: 'Open Roster',
    },
    {
      icon: Users,
      title: 'Groups',
      description: 'Organize athletes into training groups — varsity, JV, distance, sprints — and assign group leaders.',
      path: '/groups',
      cta: 'Open Groups',
    },
    {
      icon: CalendarDays,
      title: 'Practice Plans',
      description: 'Build workouts from templates and assign them to the whole team or to specific groups.',
      path: '/practice-plans',
      cta: 'Open Practice Plans',
    },
    {
      icon: Flag,
      title: 'Meets',
      description: 'Plan meet-day entries and lineups, and import your season schedule straight from Athletic.net.',
      path: '/meets',
      cta: 'Open Meets',
    },
  ],
  athlete: [
    {
      icon: Gauge,
      title: 'My Progress',
      description: 'Your personal dashboard — race history and training paces, plus a button to log a run yourself.',
      path: '/me',
      cta: 'View My Progress',
    },
    {
      icon: Home,
      title: 'Analytics',
      description: "See your races in the context of the whole team's season.",
      path: '/analytics',
      cta: 'View Analytics',
    },
    {
      icon: BarChart2,
      title: 'Results Grid',
      description: 'A sortable table of every race result for the season, yours included.',
      path: '/results-grid',
      cta: 'Open Results Grid',
    },
    {
      icon: Calculator,
      title: 'Pace Calculator',
      description: 'VDOT-based training paces, calculated from your most recent race.',
      path: '/tools',
      cta: 'Open Pace Calculator',
    },
    {
      icon: ClipboardList,
      title: 'Roster',
      description: 'See your teammates, coaches, and team info.',
      path: '/roster',
      cta: 'Open Roster',
    },
  ],
};
