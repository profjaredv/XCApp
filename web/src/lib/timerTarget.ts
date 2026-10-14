// The top bar's Timer button (docs/leadpack-new-ui-trial.md §3.5): one
// button that opens whichever timer fits right now. Pure, so the three
// cases are unit-tested; components/next/TimerButton.tsx fetches.

export interface TimerRace {
  id: string;
  name: string;
  hasResults: boolean;
}

export interface TimerSession {
  id: string;
  title: string;
}

export type TimerTarget =
  | { kind: 'race'; raceId: string }
  | { kind: 'pick-race'; races: TimerRace[] }
  | { kind: 'session'; sessionId: string }
  | { kind: 'pick-session'; sessions: TimerSession[] }
  | { kind: 'sessions-list' };

export function timerTarget(todaysRaces: TimerRace[], scopedSessionsToday: TimerSession[]): TimerTarget {
  // 1. A meet today with a race that has no results yet: its live timer.
  const open = todaysRaces.filter((r) => !r.hasResults);
  if (open.length === 1) return { kind: 'race', raceId: open[0].id };
  if (open.length > 1) return { kind: 'pick-race', races: open };
  // 2. Otherwise the scoped group's interval session today.
  if (scopedSessionsToday.length === 1) return { kind: 'session', sessionId: scopedSessionsToday[0].id };
  if (scopedSessionsToday.length > 1) return { kind: 'pick-session', sessions: scopedSessionsToday };
  // 3. Otherwise the interval sessions list (it has no group preselect).
  return { kind: 'sessions-list' };
}
