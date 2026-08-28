import { createContext, useContext } from 'react';

// "Nerd mode": one app-wide switch that reveals, next to every derived
// number, the formula and the actual arithmetic that produced it.
//
// Two purposes, and the second one constrains the design more than the
// first: (1) show how a calculation was applied, and (2) let a coach
// satisfy themselves it is RIGHT. A panel that restated formulas from a
// hand-written string could drift from the code and quietly start lying —
// which would destroy exactly the trust it exists to build. So every
// explanation rendered in nerd mode is produced by the same function that
// produced the number, as a by-product of computing it. See the `explain`
// traces in lib/paceZones.ts.
//
// Deliberately not a server-side setting: this is a per-person, per-device
// display preference, like a zoom level. localStorage keeps it across
// reloads without a round trip or a schema change.

export interface NerdModeContextValue {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (on: boolean) => void;
}

export const NerdModeContext = createContext<NerdModeContextValue>({
  enabled: false,
  toggle: () => {},
  setEnabled: () => {},
});

export const NERD_MODE_STORAGE_KEY = 'xc_nerd_mode';

export function useNerdMode(): NerdModeContextValue {
  return useContext(NerdModeContext);
}
