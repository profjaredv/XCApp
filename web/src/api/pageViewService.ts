import api from './api';

// E2 (LeadPack Master Build Handoff): fire-and-forget usage logging.
// Never throws — a logging failure must never be visible to the user or
// block navigation. Route normalization (stripping ids) happens
// server-side (backend/lib/pageViewLogging.js), so this just forwards the
// raw pathname.
export function logPageView(pathname: string): void {
  api.post('/page-views', { route: pathname }).catch(() => {
    // Intentionally silent.
  });
}
