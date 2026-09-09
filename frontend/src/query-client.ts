import { QueryClient } from '@tanstack/react-query';

// The one shared cache every Refine-mounted page uses (see ui/refine.tsx).
// No background polling or focus refetching — a page only refetches when it
// explicitly asks (mutation settle, a manual refresh), matching the app's
// previous behaviour before this cache existed.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 0,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});
