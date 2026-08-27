import axios from 'axios';
import { getAdminTeamId, getPreviewAthleteId } from '../lib/impersonation';
import { getJWTToken } from '../lib/auth';

// Export the axios instance as both default and named export
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:3001/api'),
});

// The bearer token, refreshed per request.
//
// AuthProvider used to call getJWTToken() once at sign-in and pin the
// result on api.defaults.headers.common['Authorization'] forever. Neon
// Auth JWTs are short-lived, so once that one token passed its exp every
// request started coming back 403 "Invalid or expired token." from
// middleware/auth.js — and because react-query still had the GETs cached,
// the screen looked fine right up until you clicked something. That is
// exactly the reported symptom: open Settings, come back later, hit
// Resend, get a 403 on an action that should plainly be allowed.
//
// getJWTToken() is the right primitive to call on every request, not a
// costly one: @neondatabase/auth caches the session and derives that
// cache's TTL from the JWT's own `exp` (minus a clock-skew buffer), so
// this returns the in-memory token with no network call until it is
// genuinely near expiry, then transparently fetches a fresh one. Neon's
// own client factory does the same thing — it passes getJWTToken as the
// per-request token source for its data API.
//
// A null token means no session (signed out, or mid-sign-out): send no
// header at all and let the server answer 401, rather than sending a
// known-dead one.
api.interceptors.request.use(async (config) => {
  try {
    const token = await getJWTToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers.delete('Authorization');
    }
  } catch (err) {
    // Never block the request on the token lookup — a failed refresh
    // should surface as the server's own 401/403, which the UI already
    // knows how to report, not as an unhandled rejection here.
    console.error('Could not refresh auth token:', err);
  }
  return config;
});

// Attaches the "acting as" headers (see lib/impersonation.ts) to every
// request when one is active. These are read-only hints to the server —
// backend/middleware/auth.js's authenticate is the only thing that decides
// whether either header actually changes anything, and only ever does so
// after an independent, DB-backed check on the real authenticated user
// (never trusting the header's value on its own). A non-admin/non-coach
// account sending these gets silently ignored server-side, same as if the
// header were never sent.
api.interceptors.request.use((config) => {
  const adminTeamId = getAdminTeamId();
  if (adminTeamId) {
    config.headers.set('X-Admin-Team-Id', adminTeamId);
  }
  const previewAthleteId = getPreviewAthleteId();
  if (previewAthleteId) {
    config.headers.set('X-Preview-Athlete-Id', previewAthleteId);
  }
  return config;
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't automatically redirect to login, let the components handle auth errors
    // This prevents the redirect loop when team settings page loads
    console.error('API Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

api.interceptors.request.use(
    (config) => config,
    (error) => Promise.reject(error)
);

// For backward compatibility
export const axiosInstance = api;
export default api;
