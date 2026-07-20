import axios from 'axios';

// Export the axios instance as both default and named export
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:3001/api'),
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
