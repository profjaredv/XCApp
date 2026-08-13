import { createContext, useContext } from 'react';
import type { WalkthroughRole } from '../lib/walkthroughContent';

export interface WalkthroughContextValue {
  isOpen: boolean;
  role: WalkthroughRole | null;
  open: () => void;
  close: () => void;
}

// Keyed by user + role (not just user) so someone who starts as an athlete
// and later becomes a coach (or vice versa) still gets the tour for their
// new role, rather than it staying permanently dismissed from the old one.
export function walkthroughStorageKey(userId: string, role: WalkthroughRole) {
  return `xcapp:walkthrough-seen:${userId}:${role}`;
}

export const WalkthroughContext = createContext<WalkthroughContextValue | undefined>(undefined);

export function useWalkthrough() {
  const context = useContext(WalkthroughContext);
  if (context === undefined) {
    throw new Error('useWalkthrough must be used within a WalkthroughProvider');
  }
  return context;
}
