import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StackProvider, StackTheme } from '@stackframe/react';
import { stackClientApp } from './lib/stackClientApp';
import { router } from './router';
import { AuthProvider } from './components/AuthProvider';
import './index.css';

// Create a client
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StackProvider app={stackClientApp}>
      <StackTheme>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </StackTheme>
    </StackProvider>
  </StrictMode>
);
