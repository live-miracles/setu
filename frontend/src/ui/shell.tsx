import { Button, cx } from '../ui/kit';
import { DropdownMenu } from '../ui/overlay-kit';
import { Icon } from '../ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import appLogo from '../../assets/logo.png';
import { useDashboardOptional } from '../dashboard-context';
import {
    blocksPath,
    calendarPath,
    departmentsPath,
    homeContentPath,
    homePath,
    inventoryPath,
    inventoryTypesPath,
    profilePath,
    programsPath,
    rosterPath,
    usersPath,
} from '../paths';
import { canApprove } from '../workflows';
import { currentUserEmail, signOutAndReload } from '../supabase';
import { showErrorAlert } from './feedback';
import { APP_LOADING_EVENT, AppLoading } from './app-loading';
import { useIsMobileViewport } from './viewport';

type NavItem = { key: string; to: string; label: string; icon?: ReactNode };

const primaryNavItems: NavItem[] = [
    { key: 'programs', to: programsPath, label: 'Programs', icon: <Icon name="appstore" /> },
    { key: 'calendar', to: calendarPath, label: 'Calendar', icon: <Icon name="calendar" /> },
    { key: 'inventory', to: inventoryPath, label: 'Inventory', icon: <Icon name="inbox" /> },
];

// Roster and inventory types are readable by every signed-in user. The
// remaining configuration entries are admin/approver-only, with user and
// configuration management kept in the account dropdown.
const configNavItems: NavItem[] = [
    { key: 'roster', to: rosterPath, label: 'Roster', icon: <Icon name="schedule" /> },
    { key: 'users', to: usersPath, label: 'Users', icon: <Icon name="team" /> },
    {
        key: 'departments',
        to: departmentsPath,
        label: 'Departments',
        icon: <Icon name="apartment" />,
    },
    {
        key: 'inventory-types',
        to: inventoryTypesPath,
        label: 'Inventory types',
        icon: <Icon name="tags" />,
    },
    { key: 'blocks', to: blocksPath, label: 'Blocks', icon: <Icon name="block" /> },
    {
        key: 'home-content',
        to: homeContentPath,
        label: 'Other settings',
        icon: <Icon name="settings" />,
    },
];

// User and configuration management stays in the account menu; the remaining
// config entries are desktop navigation items for admins/approvers.
const accountConfigKeys = new Set(['users', 'departments', 'home-content']);
const publicConfigKeys = new Set(['roster', 'inventory-types']);
const publicConfigNavItems = configNavItems.filter((item) => publicConfigKeys.has(item.key));
const topConfigNavItems = configNavItems.filter(
    (item) => !accountConfigKeys.has(item.key) && !publicConfigKeys.has(item.key),
);
const accountConfigNavItems = configNavItems.filter((item) => accountConfigKeys.has(item.key));

// A plain pathname.startsWith(base) would also match e.g. /inventory-types
// for base '/inventory' — this requires the match to land on a segment
// boundary instead.
function isPathSection(pathname: string, base: string): boolean {
    return pathname === base || pathname.startsWith(`${base}/`);
}

// Mirrors router.ts's old renderCurrentSection class-toggling, computed from
// the URL instead of imperatively — see build-tools/layout.test.mjs, which
// asserts on these exact class names.
function contentClassName(pathname: string): string {
    const isHome = pathname === homePath;
    const isWorkbench =
        isPathSection(pathname, inventoryPath) || isPathSection(pathname, programsPath);
    const isUsers = isPathSection(pathname, usersPath);
    const isDepartments = isPathSection(pathname, departmentsPath);
    const isInventoryTypes = isPathSection(pathname, inventoryTypesPath);
    const isSettings =
        isUsers ||
        isDepartments ||
        isInventoryTypes ||
        isPathSection(pathname, blocksPath) ||
        isPathSection(pathname, homeContentPath);
    const isEdgeToEdge = isWorkbench;
    return [
        'app-content',
        isHome && 'app-content-home',
        isEdgeToEdge && 'app-content-edge',
        isSettings && !isInventoryTypes && 'app-content-settings',
        isDepartments && 'app-content-departments',
        isUsers && 'app-content-users',
        isInventoryTypes && 'app-content-inventory-types',
        !isHome && !isEdgeToEdge && 'mx-auto',
        !isHome && !isEdgeToEdge && !isSettings && 'max-w-[50rem]',
    ]
        .filter(Boolean)
        .join(' ');
}

export function Shell({
    children,
    dashboard: dashboardProp,
    refreshDashboard: refreshDashboardProp,
}: {
    children?: ReactNode;
    dashboard?: DashboardPayload | null;
    refreshDashboard?: () => Promise<void>;
}) {
    const dashboardContext = useDashboardOptional();
    const dashboard = dashboardProp ?? dashboardContext?.dashboard ?? null;
    const refreshDashboard = refreshDashboardProp ?? dashboardContext?.refreshDashboard;
    const location = useLocation();
    const navigationType = useNavigationType();
    const navigate = useNavigate();
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollPositions = useRef(new Map<string, number>());
    const currentPathname = useRef(location.pathname);
    currentPathname.current = location.pathname;
    const [refreshing, setRefreshing] = useState(false);
    const queryClient = useQueryClient();
    const [appLoading, setAppLoading] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const isMobileViewport = useIsMobileViewport();
    const isRegistered = Boolean(dashboard?.me.Phone);
    // Authentication has already completed before Shell mounts. Keep the
    // primary navigation visible while the dashboard (and therefore role /
    // registration state) is still loading; only role-specific links need
    // to wait for dashboard data.
    const showPrimaryNav = Boolean(userEmail) || isRegistered;
    const canOpenConfig = dashboard ? canApprove(dashboard.me) : false;
    const navigationItems = [
        ...primaryNavItems,
        ...publicConfigNavItems,
        ...(canOpenConfig ? topConfigNavItems : []),
    ];

    useEffect(() => {
        const syncAppLoading = (event: Event) =>
            setAppLoading((event as CustomEvent<boolean>).detail === true);
        window.addEventListener(APP_LOADING_EVENT, syncAppLoading);
        // Shell only ever mounts once boot() has confirmed a Supabase session
        // exists, so this reflects who is signed in even when the dashboard
        // call that fills in role/name fails (e.g. an access-restriction error).
        void currentUserEmail().then(setUserEmail);
        return () => {
            window.removeEventListener(APP_LOADING_EVENT, syncAppLoading);
        };
    }, []);

    // The scrolling element (.app-content) is shared by every route, so its
    // scroll offset would otherwise carry over. New pushes (e.g. opening a
    // detail page) start at the top; back/forward and replace navigations
    // (e.g. closing a detail page) return to where the page was left.
    useLayoutEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        el.scrollTop =
            navigationType === 'PUSH' ? 0 : (scrollPositions.current.get(location.pathname) ?? 0);
    }, [location.key, location.pathname, navigationType]);

    const selectedKey = navigationItems.find((item) =>
        isPathSection(location.pathname, item.to),
    )?.key;
    const accountNavItems = isMobileViewport
        ? configNavItems.filter((item) => !publicConfigKeys.has(item.key))
        : accountConfigNavItems;
    const profileMenuItems = [
        { key: profilePath, label: 'Profile', icon: <Icon name="user" /> },
        ...publicConfigNavItems.map((item) => ({
            key: item.to,
            label: item.label,
            icon: item.icon,
        })),
        ...(canOpenConfig
            ? accountNavItems.map((item) => ({
                  key: item.to,
                  label: item.label,
                  icon: item.icon,
              }))
            : []),
    ];

    const refresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            // Resource-hook pages read from the query cache, not the dashboard
            // blob, so both must be refetched to pick up other users' changes.
            await Promise.all([refreshDashboard?.(), queryClient.invalidateQueries()]);
        } catch (err) {
            showErrorAlert(err);
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="app-layout flex flex-col">
            <header className="app-header">
                <Button
                    type="text"
                    className="app-brand"
                    onClick={() => navigate(homePath)}
                    aria-label="Home">
                    <img className="app-brand-logo" src={appLogo} alt="" />
                    <span className="font-semibold">Setu</span>
                </Button>
                {showPrimaryNav && (
                    <nav
                        id="desktop-nav"
                        aria-label="Primary"
                        className="app-main-menu flex items-stretch gap-1 self-stretch overflow-x-auto">
                        {navigationItems.map((item) => (
                            <Link
                                key={item.key}
                                to={item.to}
                                aria-current={selectedKey === item.key ? 'page' : undefined}
                                className={cx(
                                    'inline-flex items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
                                    selectedKey === item.key
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-ink hover:text-accent',
                                )}>
                                {item.icon}
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                )}
                <div className="app-actions inline-flex items-center gap-2">
                    {userEmail && (
                        <DropdownMenu
                            items={[
                                ...(isRegistered ? profileMenuItems : []),
                                { type: 'divider' },
                                { key: 'logout', label: 'Log out' },
                            ]}
                            onSelect={(key) =>
                                key === 'logout' ? void signOutAndReload() : navigate(key)
                            }>
                            <Button
                                type="text"
                                className="app-profile-button"
                                icon={<Icon name="user" />}
                                aria-label="Account menu"
                                title={userEmail}>
                                <span>{dashboard?.me.Name || userEmail}</span>
                            </Button>
                        </DropdownMenu>
                    )}
                    {isRegistered && (
                        <Button
                            type="text"
                            icon={<Icon name="reload" spin={refreshing} />}
                            onClick={() => void refresh()}
                            aria-label="Refresh app"
                            title="Refresh app"
                        />
                    )}
                </div>
            </header>
            <main
                ref={contentRef}
                className={contentClassName(location.pathname)}
                onScroll={(event) =>
                    scrollPositions.current.set(
                        currentPathname.current,
                        event.currentTarget.scrollTop,
                    )
                }>
                {children ?? <Outlet />}
            </main>
            {appLoading && <AppLoading />}
            {showPrimaryNav && (
                <nav id="mobile-dock" className="app-mobile-menu" aria-label="Main navigation">
                    {primaryNavItems.map((item) => (
                        <Link
                            key={item.key}
                            to={item.to}
                            className={`app-mobile-nav-item${
                                selectedKey === item.key ? ' is-selected' : ''
                            }`}>
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>
            )}
        </div>
    );
}
