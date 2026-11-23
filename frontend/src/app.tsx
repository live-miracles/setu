import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Result } from './ui/kit';
import { useHomeContentQuery, useMeQuery } from './ui/reference';
import { AppProviders } from './ui/providers';
import {
    blocksPath,
    calendarPath,
    departmentsPath,
    homeContentPath,
    homePath,
    inventoryCreatePath,
    inventoryPath,
    inventoryLabelsPath,
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
import { Profile } from './sections/profile';
import { RequestDetail } from './sections/request-detail';
import { Roster } from './sections/roster';
import { Users } from './sections/users';
import { Calendar } from './sections/calendar';
import { CreateRecord, RequestTable } from './sections/requests';
import { DepartmentsPage } from './sections/departments';
import { InventoryTypesPage } from './sections/inventory-types';
import { HomeContentPage, SettingsResourcePage } from './sections/settings-pages';

export function App() {
    const navigate = useNavigate();
    // The two things every screen needs before it can draw: who is signed in
    // (role, registration) and which views are hidden. Everything else is read by
    // the screen that needs it.
    const meQuery = useMeQuery();
    const homeContentQuery = useHomeContentQuery();
    const me = meQuery.data;
    const error = [meQuery, homeContentQuery].find((query) => !query.data && query.error)?.error;

    if (error) {
        return (
            <Shell>
                <Result
                    status="error"
                    title="Something went wrong"
                    subTitle={error instanceof Error ? error.message : String(error)}
                />
            </Shell>
        );
    }
    if (!me || !homeContentQuery.data) {
        return (
            <Shell>
                <AppLoading />
            </Shell>
        );
    }

    if (!me.Phone) {
        return (
            <Shell>
                <Profile registration />
            </Shell>
        );
    }

    // The list and an open request share one element, so opening a request
    // keeps the list's filters, search and page. The key makes switching between
    // Programs and Inventory start the other board's filters afresh.
    const inventoryBoard = (
        <RequestTable
            key="inventory"
            kind="inventory"

            renderDetail={(id) => <RequestDetail kind="inventory" id={id} />}
        />
    );
    const programBoard = (
        <RequestTable
            key="programs"
            kind="programs"

            renderDetail={(id) => <RequestDetail kind="programs" id={id} />}
        />
    );
    return (
        <Routes>
            <Route element={<Shell />}>
                <Route path={homePath} element={<Home />} />
                <Route path={profilePath} element={<Profile />} />
                <Route path={rosterPath} element={<Roster />} />
                <Route
                    path={usersPath}
                    element={
                        <RequireRole me={me} allow={canApprove}>
                            <Users />
                        </RequireRole>
                    }
                />
                <Route
                    path={`${usersPath}/:email`}
                    element={
                        <RequireRole me={me} allow={canApprove}>
                            <Users />
                        </RequireRole>
                    }
                />
                <Route path={calendarPath} element={<Calendar />} />
                <Route path={inventoryPath} element={inventoryBoard} />
                <Route
                    path={inventoryCreatePath}
                    element={
                        <CreateRecord
                            kind="inventory"

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

                            onClose={() => navigate(programsPath)}
                        />
                    }
                />
                <Route path={`${programsPath}/:id`} element={programBoard} />
                <Route
                    path={departmentsPath}
                    element={
                        <RequireRole me={me} allow={canApprove}>
                            <DepartmentsPage />
                        </RequireRole>
                    }
                />
                <Route
                    path={`${departmentsPath}/:id`}
                    element={
                        <RequireRole me={me} allow={canApprove}>
                            <DepartmentsPage />
                        </RequireRole>
                    }
                />
                <Route path={inventoryTypesPath} element={<InventoryTypesPage />} />
                <Route path={`${inventoryTypesPath}/:id`} element={<InventoryTypesPage />} />
                <Route path={inventoryLabelsPath} element={<InventoryTypesPage kind="labels" />} />
                <Route
                    path={`${inventoryLabelsPath}/:id`}
                    element={<InventoryTypesPage kind="labels" />}
                />
                <Route
                    path={blocksPath}
                    element={
                        <RequireRole me={me} allow={canApprove}>
                            <SettingsResourcePage resourceName="blocks" />
                        </RequireRole>
                    }
                />
                <Route
                    path={homeContentPath}
                    element={
                        <RequireRole me={me} allow={canApprove}>
                            <HomeContentPage />
                        </RequireRole>
                    }
                />
                <Route path="*" element={<Navigate to={homePath} replace />} />
            </Route>
        </Routes>
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
