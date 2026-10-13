import api from './api';

// E2 (LeadPack Master Build Handoff): fire-and-forget usage logging.
// Never throws — a logging failure must never be visible to the user or
// block navigation. Route normalization (stripping ids) happens
// server-side (backend/lib/pageViewLogging.js), so this just forwards the
// raw pathname. `ui` is which shell the page was opened in (the UI trial,
// docs/leadpack-new-ui-trial.md §1.2); the server stores anything but
// "next" as "classic".
export function logPageView(pathname: string, ui: 'classic' | 'next'): void {
  api.post('/page-views', { route: pathname, ui }).catch(() => {
    // Intentionally silent.
  });
}
