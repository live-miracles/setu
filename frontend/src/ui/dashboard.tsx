import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { AppLoading } from './app-loading';
import { Result } from './kit';

// The home screen's data (see DashboardPayload): the requests that need
// attention, the latest comments and the upcoming roster. An ordinary query like
// any other: it refetches when the home screen or the roster opens, and a save
// to a request or a roster marks it stale (DEPENDENT_QUERIES in resources.ts).
export function useDashboard() {
    return useQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboard() });
}

// Draws the loading and error states of the dashboard query around a screen that
// is built from it. A refetch in the background keeps the screen on display.
export function DashboardGate({
    children,
}: {
    children: (dashboard: DashboardPayload) => ReactNode;
}) {
    const { data, error } = useDashboard();
    if (data) return children(data);
    if (error) {
        return (
            <Result
                status="error"
                title="Something went wrong"
                subTitle={error instanceof Error ? error.message : String(error)}
            />
        );
    }
    return <AppLoading inline />;
}
