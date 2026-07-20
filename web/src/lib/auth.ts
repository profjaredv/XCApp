import { createInternalNeonAuth } from '@neondatabase/neon-js/auth';
import { BetterAuthReactAdapter, type BetterAuthReactAdapterInstance } from '@neondatabase/neon-js/auth/react/adapters';

// Neon Auth is Better Auth under the hood (the project's Auth tab says
// "Powered by Better Auth"), not Stack Auth. It's served from this
// project's own Neon endpoint (VITE_NEON_AUTH_URL) rather than a shared
// host, so no separate project ID / publishable key is needed client-side.
//
// The explicit <BetterAuthReactAdapterInstance> type argument is required —
// TS can't infer it from the config object alone, and without it
// `authClient.useSession` resolves to a non-callable union member.
const { adapter: authClient, getJWTToken } = createInternalNeonAuth<BetterAuthReactAdapterInstance>(
  import.meta.env.VITE_NEON_AUTH_URL,
  { adapter: BetterAuthReactAdapter() }
);

// `authClient` exposes the Better Auth React client directly: useSession(),
// signIn.email(), signUp.email(), signOut(), etc. `getJWTToken()` is Neon
// Auth's own addition — it returns a bearer token for calling our Express
// backend (not part of the flattened authClient API).
export { authClient, getJWTToken };
