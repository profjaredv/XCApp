import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamColors } from '@/hooks/useTeamColors';
import { buildThemeCss, resolveColors } from '@/lib/teamColors';

// Paints the app in the signed-in team's colors by keeping one <style> tag
// in <head> in step with the team's saved colors. No colors saved → no tag →
// the default green from index.css.
//
// The last css is also kept in localStorage and applied by
// applyCachedTeamTheme() before React renders, so a reload does not flash the
// default green for a team with its own colors. It is cleared on sign-out so
// the next person on a shared device does not see this team's colors.

const STYLE_ID = 'team-theme';
const CACHE_KEY = 'xc_team_theme_css';

// The browser's address/status bar color. index.html ships LeadPack green; a
// team with its own colors gets its main color (the light-mode one, which is
// always dark enough for white status icons).
const DEFAULT_BAR = '#005827';
function setBarColor(hex: string | null) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', hex ?? DEFAULT_BAR);
}

function setStyle(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function applyCachedTeamTheme() {
  try {
    const css = window.localStorage.getItem(CACHE_KEY);
    if (css && /^[-a-z0-9:;{}.,()/\s]+$/i.test(css)) setStyle(css);
  } catch {
    // Storage blocked: the default theme shows until the colors load.
  }
}

export const TeamThemeStyles: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const signedIn = !!currentUser;
  const { data, isSuccess } = useTeamColors(signedIn);

  useEffect(() => {
    if (loading) return;
    if (!signedIn) {
      setStyle('');
      setBarColor(null);
      try {
        window.localStorage.removeItem(CACHE_KEY);
      } catch {
        // nothing to clear
      }
      return;
    }
    if (!isSuccess) return;
    const css = buildThemeCss(data?.colors);
    setStyle(css);
    setBarColor(resolveColors(data?.colors)?.light.primary ?? null);
    try {
      if (css) window.localStorage.setItem(CACHE_KEY, css);
      else window.localStorage.removeItem(CACHE_KEY);
    } catch {
      // The colors just will not be remembered across reloads.
    }
  }, [loading, signedIn, isSuccess, data]);

  return null;
};
