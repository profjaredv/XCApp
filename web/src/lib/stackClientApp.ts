import { StackClientApp } from '@stackframe/react';

// Neon Auth is Stack Auth under the hood. This is the browser-side client
// app object — it talks to Stack's hosted auth API directly (sign in/up,
// session refresh) and never touches our own backend.
//
// UNVERIFIED: written from Stack Auth's documented patterns without being
// able to confirm the exact `@stackframe/react` API against live docs in
// this session (see MIGRATION_STATUS.md). Before relying on this, run
// `npx @stackframe/stack-cli@latest init` in web/ once a Stack/Neon Auth
// project exists — it scaffolds this file (and the provider wiring)
// against the actual current SDK and is the authoritative source, not
// this hand-written version.
export const stackClientApp = new StackClientApp({
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
