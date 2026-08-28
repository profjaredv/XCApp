import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NerdModeContext, NERD_MODE_STORAGE_KEY } from './NerdModeContext';

// Mounted at the very top (main.tsx), above the router, so the setting is
// genuinely app-wide: it has to cover the standalone full-screen routes
// (the live timer, interval sessions, splits entry) that render outside
// <Layout>, and /profile, which sits outside the team-scoped subtree where
// SeasonProvider lives.
//
// Split from NerdModeContext.ts for the same reason SeasonProvider and
// WalkthroughProvider are: a file that mixes a component export with
// non-component exports breaks Vite's fast refresh.
export const NerdModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Read lazily rather than in an effect, so the first paint already has
  // the right value — otherwise every panel flashes in a moment after load
  // for anyone who leaves it on.
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(NERD_MODE_STORAGE_KEY) === 'true';
    } catch {
      // Private browsing, or storage blocked entirely. Not a reason to
      // fail to render the app — just start off.
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(NERD_MODE_STORAGE_KEY, String(enabled));
    } catch {
      // Same as above: the preference just won't survive a reload.
    }
  }, [enabled]);

  const setEnabled = useCallback((on: boolean) => setEnabledState(on), []);
  const toggle = useCallback(() => setEnabledState((v) => !v), []);
  const value = useMemo(() => ({ enabled, toggle, setEnabled }), [enabled, toggle, setEnabled]);

  return <NerdModeContext.Provider value={value}>{children}</NerdModeContext.Provider>;
};
