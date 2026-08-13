import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { WalkthroughContext, walkthroughStorageKey } from './WalkthroughContext';
import type { WalkthroughRole } from '../lib/walkthroughContent';

// Mounted once in ProtectedRoute so it covers every authenticated landing
// spot an invite can drop someone on (/profile for a new staff member,
// /t/:athleticTeamId/... for a new athlete) — not just Layout's routes,
// which /profile isn't one of.
export const WalkthroughProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Matches Layout.tsx's own isCoach check ('coach' only — 'captain' reads
  // as an athlete for nav purposes, same convention here).
  const role: WalkthroughRole | null = useMemo(() => {
    if (!currentUser) return null;
    if (currentUser.role === 'coach') return 'coach';
    if (currentUser.linkedAthlete) return 'athlete';
    return null;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !role || typeof window === 'undefined') return;
    if (!window.localStorage.getItem(walkthroughStorageKey(currentUser.uid, role))) {
      setIsOpen(true);
    }
  }, [currentUser, role]);

  const close = useCallback(() => {
    setIsOpen(false);
    if (currentUser && role && typeof window !== 'undefined') {
      window.localStorage.setItem(walkthroughStorageKey(currentUser.uid, role), 'true');
    }
  }, [currentUser, role]);

  const open = useCallback(() => setIsOpen(true), []);

  const value = useMemo(() => ({ isOpen, role, open, close }), [isOpen, role, open, close]);

  return <WalkthroughContext.Provider value={value}>{children}</WalkthroughContext.Provider>;
};
