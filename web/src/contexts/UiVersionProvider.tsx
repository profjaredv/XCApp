import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/api';
import { useAuth } from './AuthContext';
import {
  UiVersionContext,
  UI_VERSION_PENDING_KEY,
  UI_VERSION_STORAGE_KEY,
  isUiVersion,
  type UiVersion,
} from './UiVersionContext';

// Mounted in main.tsx beside NerdModeProvider, for the same reason: the
// shell choice has to reach routes outside the team subtree (/profile, the
// sign-in pages a ?ui= link lands on). Same lazy-localStorage-first-paint
// pattern as NerdModeProvider, with one difference: the account's saved
// value (User.uiVersion, from GET /users/me) is the source of truth, so
// once the user loads it overrides whatever this device remembered.
//
// Preview-as-athlete needs nothing extra here: /users/me during a preview
// is still the coach's own User row (the preview only swaps linkedAthlete),
// so the athlete view renders in whichever shell the coach is in.

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Private browsing or storage blocked: the server still has it.
  }
}

async function saveToServer(uiVersion: UiVersion, reason?: string) {
  await api.patch('/profile/ui-version', reason ? { uiVersion, reason } : { uiVersion });
}

export const UiVersionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, setCurrentUser } = useAuth();

  // What this device remembers — only used until the account loads (first
  // paint, the sign-in pages) and for a signed-out ?ui= choice.
  const [localValue, setLocalValue] = useState<UiVersion>(() => {
    const pending = readStorage(window.sessionStorage, UI_VERSION_PENDING_KEY);
    if (isUiVersion(pending)) return pending;
    const stored = readStorage(window.localStorage, UI_VERSION_STORAGE_KEY);
    return isUiVersion(stored) ? stored : 'classic';
  });
  // A ?ui= choice waiting for an account to save it to.
  const [pending, setPending] = useState<UiVersion | null>(() => {
    const value = readStorage(window.sessionStorage, UI_VERSION_PENDING_KEY);
    return isUiVersion(value) ? value : null;
  });

  // Derived, not synced in an effect: once the account is loaded its saved
  // value IS the answer, on the very render it arrives — so nothing (the
  // shell, a page-view log) ever sees this device's stale guess first.
  const serverValue = currentUser?.uiVersion;
  const uiVersion: UiVersion = pending ?? serverValue ?? localValue;

  useEffect(() => {
    writeStorage(window.localStorage, UI_VERSION_STORAGE_KEY, uiVersion);
  }, [uiVersion]);

  // The booth link arrived before sign-in: push it to the account once
  // there is one. Keyed on the user id so it runs once per sign-in.
  const userId = currentUser?.uid;
  useEffect(() => {
    if (!userId || !pending || !currentUser) return;
    writeStorage(window.sessionStorage, UI_VERSION_PENDING_KEY, null);
    setPending(null);
    if (currentUser.uiVersion !== pending) {
      setCurrentUser({ ...currentUser, uiVersion: pending });
      saveToServer(pending).catch(() => {
        // The shell still switched for this session; the next device just
        // won't know until they switch there too.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pending]);

  const setUiVersion = useCallback(
    async (next: UiVersion, reason?: string) => {
      setLocalValue(next);
      if (!currentUser) {
        writeStorage(window.sessionStorage, UI_VERSION_PENDING_KEY, next);
        setPending(next);
        return;
      }
      setCurrentUser({ ...currentUser, uiVersion: next });
      try {
        await saveToServer(next, reason);
      } catch {
        // Switched for this session regardless; see above.
      }
    },
    [currentUser, setCurrentUser]
  );

  const value = useMemo(
    () => ({ uiVersion, setUiVersion, requestUiVersion: (next: UiVersion) => void setUiVersion(next) }),
    [uiVersion, setUiVersion]
  );

  return <UiVersionContext.Provider value={value}>{children}</UiVersionContext.Provider>;
};
