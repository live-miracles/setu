import { createContext, useContext, type ReactNode } from 'react';

interface DashboardContextValue {
    dashboard: DashboardPayload;
    refreshDashboard: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

// The dashboard blob is fetched once at boot (see app.tsx) and handed down
// through context so any component — however deep — can trigger a refetch
// after a mutation without threading a callback through every intermediate
// layer. The payload itself still flows down as an ordinary `dashboard` prop
// from each route's element (see app.tsx's route table), matching the
// `Props = { dashboard: DashboardPayload }` convention every section already
// uses; this context exists only for `refreshDashboard`'s reach, and is only
// ever mounted once real dashboard data is available.
export function DashboardProvider({
    dashboard,
    refreshDashboard,
    children,
}: DashboardContextValue & { children: ReactNode }) {
    return (
        <DashboardContext.Provider value={{ dashboard, refreshDashboard }}>
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboard(): DashboardContextValue {
    const value = useDashboardOptional();
    if (!value) throw new Error('useDashboard() must be used within a DashboardProvider.');
    return value;
}

export function useDashboardOptional(): DashboardContextValue | null {
    return useContext(DashboardContext);
}
