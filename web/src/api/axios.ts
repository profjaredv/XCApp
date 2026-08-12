import axios from 'axios';
import { getAdminTeamId, getPreviewAthleteId } from '../lib/impersonation';

// Export the axios instance as both default and named export
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:3001/api'),
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
