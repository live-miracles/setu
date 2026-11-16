import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Result } from './ui/kit';
import { api } from './api';
import { DashboardProvider } from './dashboard-context';
import { AppProviders } from './ui/providers';
import {
    blocksPath,
    calendarPath,
    departmentsPath,
    homeContentPath,
    homePath,
    inventoryCreatePath,
    inventoryPath,
    inventoryTypesPath,
    profilePath,
    programCreatePath,
    programsPath,
    rosterPath,
    usersPath,
} from './paths';
import { RequireRole } from './require-role';
import { canApprove } from './workflows';
import { AppLoading } from './ui/app-loading';
import { Shell } from './ui/shell';
import { Home } from './sections/home';
import { Profile, RequestDetail } from './sections/refine-app';
import { Roster } from './sections/roster';
import { Users } from './sections/users';
import { Calendar } from './sections/calendar';
import { CreateRecord, RequestTable } from './sections/requests';
import { DepartmentsPage } from './sections/departments';
import { InventoryTypesPage } from './sections/inventory-types';
import { HomeContentPage, SettingsResourcePage } from './sections/refine-settings';

export function App() {
    const navigate = useNavigate();
    const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refreshDashboard = useCallback(async () => {
        const next = await api.getDashboard();
        setDashboard(next);
    }, []);

    useEffect(() => {
        refreshDashboard().catch((err) =>
            setError(err instanceof Error ? err.message : String(err)),
        );
    }, [refreshDashboard]);

    if (error) {
        return (
            <Shell dashboard={null} refreshDashboard={refreshDashboard}>
                <Result status="error" title="Something went wrong" subTitle={error} />
            </Shell>
        );
    }
    if (!dashboard) {
        return (
            <Shell dashboard={null} refreshDashboard={refreshDashboard}>
                <AppLoading />
            </Shell>
        );
    }

    if (!dashboard.me.Phone) {
        return (
            <DashboardProvider dashboard={dashboard} refreshDashboard={refreshDashboard}>
                <Shell>
                    <Profile dashboard={dashboard} registration />
                </Shell>
            </DashboardProvider>
        );
    }

    const me = dashboard.me;
    // The list and an open request share one element, so opening a request
    // keeps the list's filters, search and page.
    const inventoryBoard = (
        <RequestTable
            kind="inventory"
            dashboard={dashboard}
            renderDetail={(id) => <RequestDetail kind="inventory" id={id} dashboard={dashboard} />}
        />
    );
    const programBoard = (
        <RequestTable
            kind="programs"
            dashboard={dashboard}
            renderDetail={(id) => <RequestDetail kind="programs" id={id} dashboard={dashboard} />}
        />
    );
    return (
        <DashboardProvider dashboard={dashboard} refreshDashboard={refreshDashboard}>
            <Routes>
                <Route element={<Shell />}>
                    <Route path={homePath} element={<Home dashboard={dashboard} />} />
                    <Route path={profilePath} element={<Profile dashboard={dashboard} />} />
                    <Route path={rosterPath} element={<Roster dashboard={dashboard} />} />
                    <Route
                        path={usersPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <Users dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={`${usersPath}/:email`}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <Users dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
                    <Route path={calendarPath} element={<Calendar dashboard={dashboard} />} />
                    <Route path={inventoryPath} element={inventoryBoard} />
                    <Route
                        path={inventoryCreatePath}
                        element={
                            <CreateRecord
                                kind="inventory"
                                dashboard={dashboard}
                                onClose={() => navigate(inventoryPath)}
                            />
                        }
                    />
                    <Route path={`${inventoryPath}/:id`} element={inventoryBoard} />
                    <Route path={programsPath} element={programBoard} />
                    <Route
                        path={programCreatePath}
                        element={
                            <CreateRecord
                                kind="programs"
                                dashboard={dashboard}
                                onClose={() => navigate(programsPath)}
                            />
                        }
                    />
                    <Route path={`${programsPath}/:id`} element={programBoard} />
                    <Route
                        path={departmentsPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <DepartmentsPage dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={`${departmentsPath}/:id`}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <DepartmentsPage dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={inventoryTypesPath}
                        element={<InventoryTypesPage dashboard={dashboard} />}
                    />
                    <Route
                        path={`${inventoryTypesPath}/:id`}
                        element={<InventoryTypesPage dashboard={dashboard} />}
                    />
                    <Route
                        path={blocksPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <SettingsResourcePage resourceName="blocks" dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={homeContentPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <HomeContentPage dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
                    <Route path="*" element={<Navigate to={homePath} replace />} />
                </Route>
            </Routes>
        </DashboardProvider>
    );
}

export function mountApp(container: HTMLElement): void {
    createRoot(container).render(
        <BrowserRouter>
            <AppProviders>
                <App />
            </AppProviders>
        </BrowserRouter>,
    );
}
