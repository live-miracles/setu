import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Result } from 'antd';
import { api } from './api';
import { DashboardProvider } from './dashboard-context';
import { AppProviders } from './ui/refine';
import {
    blocksPath,
    calendarPath,
    departmentsPath,
    homeContentPath,
    homePath,
    inventoryCreatePath,
    inventoryPath,
    inventoryTypesPath,
    placesPath,
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
    return (
        <DashboardProvider dashboard={dashboard} refreshDashboard={refreshDashboard}>
            <Routes>
                <Route element={<Shell />}>
                    <Route path={homePath} element={<Home dashboard={dashboard} />} />
                    <Route path={profilePath} element={<Profile dashboard={dashboard} />} />
                    <Route
                        path={rosterPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <Roster dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
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
                    <Route
                        path={inventoryPath}
                        element={<RequestTable kind="inventory" dashboard={dashboard} />}
                    />
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
                    <Route
                        path={`${inventoryPath}/:id`}
                        element={<RequestDetail kind="inventory" dashboard={dashboard} />}
                    />
                    <Route
                        path={programsPath}
                        element={<RequestTable kind="programs" dashboard={dashboard} />}
                    />
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
                    <Route
                        path={`${programsPath}/:id`}
                        element={<RequestDetail kind="programs" dashboard={dashboard} />}
                    />
                    <Route
                        path={departmentsPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <SettingsResourcePage
                                    resourceName="departments"
                                    dashboard={dashboard}
                                />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={`${departmentsPath}/:id`}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <SettingsResourcePage
                                    resourceName="departments"
                                    dashboard={dashboard}
                                />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={placesPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <SettingsResourcePage resourceName="places" dashboard={dashboard} />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={inventoryTypesPath}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <SettingsResourcePage
                                    resourceName="inventory-types"
                                    dashboard={dashboard}
                                />
                            </RequireRole>
                        }
                    />
                    <Route
                        path={`${inventoryTypesPath}/:id`}
                        element={
                            <RequireRole me={me} allow={canApprove}>
                                <SettingsResourcePage
                                    resourceName="inventory-types"
                                    dashboard={dashboard}
                                />
                            </RequireRole>
                        }
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
