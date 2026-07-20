// Unify API client: re-export the configured axios instance that
// uses Firebase Auth tokens and does NOT auto-redirect on 401s.
// See: src/api/axios.ts
export { api } from './axios';
export { axiosInstance } from './axios';
export { default } from './axios';
