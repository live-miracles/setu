import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryClient } from '../query-client';
import { ToastViewport } from './overlay-kit';

// Mounted once at the app root (see app.tsx); provides the shared query cache
// (query-client.ts) that every page reads through, and the toast viewport.
export function AppProviders({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
            <ToastViewport />
        </QueryClientProvider>
    );
}
