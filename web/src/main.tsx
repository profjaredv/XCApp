import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, Link as RouterLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';
import '@neondatabase/neon-js/ui/css';
import { authClient } from './lib/auth';
import { router } from './router';
import { AuthProvider } from './components/AuthProvider';
import './index.css';

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
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </NeonAuthUIProvider>
  </StrictMode>
);
