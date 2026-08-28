import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, Link as RouterLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';
// Note: Neon Auth's CSS is imported via index.css (the `@neondatabase/neon-js/ui/tailwind`
// tokens-only entry), NOT the full `/ui/css` bundle. This app already ships its own
// Tailwind v4 build; importing Neon's full pre-built CSS on top of it duplicates the
// preflight/utility layers and breaks the app's own spacing (Neon's docs: "Never import both").
import { authClient } from './lib/auth';
import { router } from './router';
import { AuthProvider } from './components/AuthProvider';
import { NerdModeProvider } from './contexts/NerdModeProvider';
import { installErrorBuffer } from './lib/errorBuffer';
import { registerServiceWorker } from './registerServiceWorker';
import './index.css';

// Start capturing console errors before anything renders, so a crash during
// initial mount is still attached to any feedback filed afterwards.
installErrorBuffer();

// Makes the app installable to a phone's home screen and precaches the
// shell so it opens without waiting on a school's wifi. No-ops in dev
// (devOptions.enabled is false in vite.config.ts) and on any browser
// without service worker support.
registerServiceWorker();

const queryClient = new QueryClient();

// better-auth-ui's Link prop shape is {href, className, children};
// react-router's Link takes `to` — bridge the two.
function Link({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <RouterLink to={href} className={className}>
      {children}
    </RouterLink>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={(href) => router.navigate(href)}
      replace={(href) => router.navigate(href, { replace: true })}
      Link={Link}
      basePath=""
      // Every view the auth forms can link to needs BOTH an entry here and a
      // matching route (router/index.tsx). SIGN_IN/SIGN_UP are renamed to
      // this app's existing /login and /register; the rest keep the
      // library's defaults and now have routes to land on. Previously only
      // the first two were declared, so the sign-in form's "Forgot
      // password?" link pointed at a route that didn't exist.
      viewPaths={{
        SIGN_IN: 'login',
        SIGN_UP: 'register',
        FORGOT_PASSWORD: 'forgot-password',
        RESET_PASSWORD: 'reset-password',
        CALLBACK: 'auth/callback',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Above the router on purpose: nerd mode has to reach the
              standalone full-screen routes (live timer, interval sessions,
              splits entry) that render outside <Layout>, and /profile,
              which sits outside the team-scoped subtree. */}
          <NerdModeProvider>
            <RouterProvider router={router} />
          </NerdModeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </NeonAuthUIProvider>
  </StrictMode>
);
