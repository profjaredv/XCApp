import { createContext, useContext } from 'react';
import type { Season } from '@/hooks/useAvailableSeasons';

// One shared "which season am I looking at" selection for the whole app —
// before this, Schedule, Meets, Interval Sessions, Groups, Equipment,
// Coaches Tools, Data Management, Results Grid, and Analytics' "Past
// Seasons" mode each kept their own independent local state (some via a
// URL param, some plain useState, one page even had its own hand-rolled
// "last 6 calendar years" list instead of the real season data everyone
// else used) — pick a season on one screen and every other screen forgot
// it existed. This is the one place that selection lives now; the
// SeasonProvider component (SeasonProvider.tsx) is provided once in
// TeamRouteGuard.tsx (wrapping every /t/:athleticTeamId/* route, including
// the standalone full-screen ones that render outside <Layout>) so it
// survives navigating between screens, and reset only on a full reload
// (same as the per-page state it replaces already behaved).
//
// Deliberately NOT for every "season" concept in the app — Results Grid's
// season picker is this. Athlete-career browsers (TeamAthleteProfilePage's
// current/all/custom mode) and multi-season comparisons are a different,
// genuinely per-page concept and stay local; they may still seed their
// initial value from activeYear here for convenience.
//
// Split into this plain .ts file (context/hooks only) and SeasonProvider.tsx
// (the component) because a file mixing component and non-component
// exports breaks Vite's fast-refresh — same pattern as WalkthroughContext.ts
// / WalkthroughProvider.tsx.

export interface SeasonContextValue {
  seasons: Season[];
  isLoadingSeasons: boolean;
  /** The server's default season for this team (accounts for imported data — never a bare calendar year). */
  activeSeason: number | undefined;
  /** Explicit user override; null means "use activeSeason." */
  selectedYear: number | null;
  setSelectedYear: (year: number | null) => void;
  /** The year every season-scoped screen should actually use. */
  activeYear: number | null;
}

export const SeasonContext = createContext<SeasonContextValue | null>(null);

export function useSeasonSelection(): SeasonContextValue {
  const ctx = useContext(SeasonContext);
  if (!ctx) throw new Error('useSeasonSelection must be used within a SeasonProvider');
  return ctx;
}

// Non-throwing variant for the one consumer that renders both inside and
// outside the provider — Layout.tsx's header, which also covers /profile
// (deliberately outside /t/:athleticTeamId, so no SeasonProvider there).
export function useOptionalSeasonSelection(): SeasonContextValue | null {
  return useContext(SeasonContext);
}
