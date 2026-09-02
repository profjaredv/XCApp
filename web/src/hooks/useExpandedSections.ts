import { useCallback, useEffect, useState } from 'react';

// Which settings sections are open, remembered per device.
//
// Two behaviours worth being deliberate about:
//
//   - Sections toggle independently. Opening one never closes another,
//     because a section may hold unsaved edits (see SettingsSection).
//   - Once a section has been opened it stays MOUNTED even when collapsed.
//     Collapsing unmounts by default, which would throw away a coach's
//     in-progress form; keeping it alive costs nothing after the first
//     open, and a section never opened is still never mounted, so the
//     page still loads without firing seven screens' worth of queries.
export function useExpandedSections(storageKey: string) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      // Storage blocked or holding something unparseable. Starting closed
      // is a fine outcome; failing to render the page is not.
      return new Set<string>();
    }
  });
  const [everOpened, setEverOpened] = useState<Set<string>>(() => new Set(open));

  // Deep links. Elsewhere in the app a link can point straight at one
  // section (Today's "Start a new season" → /settings#season-rollover);
  // landing on a page of collapsed cards with the right one still shut
  // makes that link a dead end. Opening it is not enough either — the
  // browser already gave up on scrolling to an element that didn't exist
  // at load — so this scrolls once the section has actually rendered.
  useEffect(() => {
    const target = window.location.hash.replace('#', '');
    if (!target) return;
    setOpen((current) => (current.has(target) ? current : new Set(current).add(target)));
    setEverOpened((current) => (current.has(target) ? current : new Set(current).add(target)));
    const frame = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...open]));
    } catch {
      // The preference just won't survive a reload.
    }
  }, [open, storageKey]);

  const toggle = useCallback((id: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setEverOpened((current) => (current.has(id) ? current : new Set(current).add(id)));
  }, []);

  return {
    isOpen: useCallback((id: string) => open.has(id), [open]),
    /** Render the content at all? True once a section has ever been opened. */
    isMounted: useCallback((id: string) => everOpened.has(id), [everOpened]),
    toggle,
  };
}
