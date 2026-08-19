import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { logPageView } from '@/api/pageViewService';

// E2 (LeadPack Master Build Handoff): logs one page view per route change,
// for signed-in users only (the endpoint requires authentication, and a
// logged-out visitor's page opens aren't the signal this is for anyway —
// "the input to every future cut decision" means in-app screens, not the
// marketing landing page). Mounted once at the app root (App.tsx).
export function usePageViewLogging() {
  const location = useLocation();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;
    logPageView(location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, !!currentUser]);
}
