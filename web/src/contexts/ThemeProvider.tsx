import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext, THEME_STORAGE_KEY, type Theme } from './ThemeContext';

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    // Private browsing, or storage blocked entirely — default to light,
    // same as everyone's always seen up to now.
    return 'light';
  }
}

// Mounted at the very top (main.tsx), same reasoning as NerdModeProvider:
// this has to cover the full-screen routes that render outside <Layout>,
// not just the ones with a sidebar to put a toggle in.
//
// index.html carries a matching inline script that applies the stored
// class before this (or React) ever runs, so a reload doesn't flash light
// for someone who picked dark — keep the two in sync if this key or its
// values ever change.
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Same as above: the choice just won't survive a reload.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
