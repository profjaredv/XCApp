import { createContext, useContext } from 'react';

// Light or dark, app-wide. Same shape as NerdModeContext.ts — a per-person,
// per-device display preference, not a server-side setting, so localStorage
// is enough and a schema change/round trip would be overkill.
//
// The .dark palette (index.css) already existed and was already
// accessibility-validated — it just never had anything that added the
// class. This context is that mechanism, nothing about the colors
// themselves.

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => {},
  setTheme: () => {},
});

export const THEME_STORAGE_KEY = 'xc_theme';

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
