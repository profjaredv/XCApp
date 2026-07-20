import { StackClientApp } from '@stackframe/react';

// Neon Auth is Stack Auth under the hood. This is the browser-side client
// app object — it talks to the hosted auth API directly (sign in/up,
// session refresh) and never touches our own backend.
//
// Neon Auth serves its API from the project's own Neon endpoint, not the
// shared api.stack-auth.com host most Stack Auth docs/examples assume —
// that's what VITE_STACK_API_URL is (from the Neon project's Auth tab).
//
// UNVERIFIED: written from Stack Auth's documented patterns without being
// able to confirm the exact `@stackframe/react` API against live docs in
// this session (see MIGRATION_STATUS.md). Before relying on this, run
// `npx @stackframe/stack-cli@latest init` in web/ — it scaffolds this file
// (and the provider wiring) against the actual current SDK and is the
// authoritative source, not this hand-written version.
export const stackClientApp = new StackClientApp({
  baseUrl: import.meta.env.VITE_STACK_API_URL,
  projectId: import.meta.env.VITE_STACK_PROJECT_ID,
  publishableClientKey: import.meta.env.VITE_STACK_PUBLISHABLE_CLIENT_KEY,
  tokenStore: 'cookie',
  urls: {
    signIn: '/login',
    signUp: '/register',
    afterSignIn: '/app',
    afterSignUp: '/onboarding',
  },
});
