import { Button, cx } from '../ui/kit';
import { DropdownMenu, type MenuItem } from '../ui/overlay-kit';
import { Icon } from '../ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import appLogo from '../../assets/logo.png';
import { useHomeContentQuery, useMeQuery } from './reference';
import {
    blocksPath,
    calendarPath,
    departmentsPath,
    homeContentPath,
    homePath,
    inventoryPath,
    inventoryLabelsPath,
    inventoryTypesPath,
    profilePath,
    programsPath,
    rosterPath,
    usersPath,
} from '../paths';
import { canApprove } from '../workflows';
import { readLastRequestKind, requestKindPath } from './request-kind';
import { isViewVisible, visibleRequestKinds, type HideableView } from './views';
import { inventoryKindPath, readLastInventoryKind, visibleInventoryKinds } from './inventory-kind';
import { currentUserEmail, signOutAndReload } from '../supabase';
import { showErrorAlert } from './feedback';
import { toggleTheme, useTheme } from './theme';
import { APP_LOADING_EVENT, AppLoading } from './app-loading';

// `also` lists other paths that keep the item selected (Requests covers both the
// Programs and the Inventory board). `view` is the setting that can hide the
// item (Other settings); Requests hides when both of its boards are hidden.
type NavItem = {
    key: string;
    to: string;
    label: string;
    icon?: ReactNode;
    also?: string[];
    view?: HideableView;
};

const primaryNavItems: NavItem[] = [
    {
        key: 'requests',
        to: programsPath,
        label: 'Requests',
        icon: <Icon name="appstore" />,
        also: [inventoryPath],
    },
    {
        key: 'calendar',
        to: calendarPath,
        label: 'Calendar',
        icon: <Icon name="calendar" />,
        view: 'calendar',
    },
];

// Roster and inventory types are readable by every signed-in user. The
// remaining configuration entries are admin/approver-only.
const configNavItems: NavItem[] = [
    {
        key: 'roster',
        to: rosterPath,
        label: 'Roster',
        icon: <Icon name="schedule" />,
        view: 'roster',
    },
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
        label: 'Inventory',
        icon: <Icon name="tags" />,
        also: [inventoryLabelsPath],
    },
    {
        key: 'blocks',
        to: blocksPath,
        label: 'Blocks',
        icon: <Icon name="block" />,
        view: 'blocks',
    },
    {
        key: 'home-content',
        to: homeContentPath,
        label: 'Other settings',
        icon: <Icon name="settings" />,
    },
];

// Navigation. Mobile (bottom dock) shows the first three destinations that are
// not hidden (normally Requests, Calendar and Roster, so a hidden one is replaced
// by the next in line) and puts the rest behind "More". Desktop shows every destination as a
// top tab while they fit, and only the ones that no longer fit move into "More"
// as the window narrows (see useFittingCount). The account menu is only about
// the person.
const tabKeys = new Set(['requests', 'calendar', 'roster']);
const DOCK_SLOTS = tabKeys.size;
const tabNavItems = [...primaryNavItems, ...configNavItems].filter((item) => tabKeys.has(item.key));
const moreNavItems = configNavItems.filter(
    (item) => !tabKeys.has(item.key) && item.key === 'inventory-types',
);
const moreConfigNavItems = configNavItems.filter(
    (item) => !tabKeys.has(item.key) && item.key !== 'inventory-types',
);

const NAV_TAB =
    'inline-flex cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';
const navTabClass = (selected: boolean) =>
    cx(
        NAV_TAB,
        selected
            ? 'border-accent text-accent'
            : 'border-transparent bg-transparent text-ink hover:text-accent',
    );

const NAV_GAP_PX = 4; // Tailwind gap-1, which the nav and the measurer share.

// How many of the `count` desktop tabs fit in the nav. It measures a hidden copy
// of every tab followed by the More button (so widths don't depend on what is
// currently shown) and re-measures whenever the nav is resized. When everything
// fits there is no More button; otherwise room is kept for it.
function useFittingCount(count: number, enabled: boolean) {
    const navRef = useRef<HTMLElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState(count);
    useLayoutEffect(() => {
        const nav = navRef.current;
        const measure = measureRef.current;
        if (!enabled || !nav || !measure) return;
        const update = () => {
            const widths = Array.from(measure.children, (el) => (el as HTMLElement).offsetWidth);
            const moreWidth = widths.pop() ?? 0;
            const available = nav.clientWidth;
            const total = widths.reduce((sum, width) => sum + width + NAV_GAP_PX, -NAV_GAP_PX);
            if (total <= available) return setFit(widths.length);
            let used = moreWidth;
            let shown = 0;
            while (shown < widths.length && used + NAV_GAP_PX + widths[shown] <= available) {
                used += NAV_GAP_PX + widths[shown];
                shown++;
            }
            setFit(shown);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(nav);
        void document.fonts?.ready.then(update);
        return () => observer.disconnect();
    }, [count, enabled]);
    return { navRef, measureRef, fit };
}

// Up to two initials from the display name, else the first letter of the email.
function initialsOf(name: string | undefined, email: string | null): string {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length)
        return words
            .slice(0, 2)
            .map((word) => word[0])
            .join('')
            .toUpperCase();
    return (email?.[0] ?? '?').toUpperCase();
}

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
    // The inventory labels page is as wide as the types page.
    const isInventoryTypes =
        isPathSection(pathname, inventoryTypesPath) || isPathSection(pathname, inventoryLabelsPath);
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

export function Shell({ children }: { children?: ReactNode }) {
    // Both are loaded before the app draws its routes (app.tsx); until then, or
    // if they fail, the shell shows without navigation.
    const me = useMeQuery().data;
    const homeContent = useHomeContentQuery().data;
    const location = useLocation();
    const navigationType = useNavigationType();
    const navigate = useNavigate();
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollPositions = useRef(new Map<string, number>());
    const currentPathname = useRef(location.pathname);
    currentPathname.current = location.pathname;
    const [refreshing, setRefreshing] = useState(false);
    const theme = useTheme();
    const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    const queryClient = useQueryClient();
    const [appLoading, setAppLoading] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const isRegistered = Boolean(me?.Phone);
    // Authentication has already completed before Shell mounts. The primary
    // navigation waits for the person's role and
    // which views an admin hid; drawing it earlier showed every link and then
    // removed some once the data arrived.
    const showPrimaryNav = Boolean(me && homeContent) && (Boolean(userEmail) || isRegistered);
    const canOpenConfig = me ? canApprove(me) : false;
    const visibleKinds = visibleRequestKinds(homeContent);
    const visibleInventory = visibleInventoryKinds(homeContent);
    const isShown = (item: NavItem) =>
        item.key === 'requests'
            ? visibleKinds.length > 0
            : item.key === 'inventory-types'
              ? visibleInventory.length > 0
              : !item.view || isViewVisible(homeContent, item.view);
    const tabItems = tabNavItems.filter(isShown);
    const moreItems = [...moreNavItems, ...(canOpenConfig ? moreConfigNavItems : [])].filter(
        isShown,
    );
    const desktopItems = [...tabItems, ...moreItems];
    const { navRef, measureRef, fit } = useFittingCount(desktopItems.length, showPrimaryNav);
    const visibleItems = desktopItems.slice(0, fit);
    const overflowItems = desktopItems.slice(fit);

    useEffect(() => {
        const syncAppLoading = (event: Event) =>
            setAppLoading((event as CustomEvent<boolean>).detail === true);
        window.addEventListener(APP_LOADING_EVENT, syncAppLoading);
        // Shell only ever mounts once boot() has confirmed a Supabase session
        // exists, so this reflects who is signed in even when the call
        // that fills in role/name fails (e.g. an access-restriction error).
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

    const isCurrent = (item: NavItem) =>
        [item.to, ...(item.also ?? [])].some((base) => isPathSection(location.pathname, base));
    // The Requests tab stays on the board that is open and otherwise opens the
    // kind of request the person looked at last.
    const navTarget = (item: NavItem): string => {
        if (item.key === 'inventory-types') {
            // Inventory likewise stays on the kind that is open, else the last one.
            if (isPathSection(location.pathname, inventoryLabelsPath)) return inventoryLabelsPath;
            if (isPathSection(location.pathname, inventoryTypesPath)) return inventoryTypesPath;
            const lastKind = readLastInventoryKind();
            return inventoryKindPath(
                visibleInventory.includes(lastKind) ? lastKind : (visibleInventory[0] ?? lastKind),
            );
        }
        if (item.key !== 'requests') return item.to;
        if (isPathSection(location.pathname, inventoryPath)) return inventoryPath;
        if (isPathSection(location.pathname, programsPath)) return programsPath;
        const last = readLastRequestKind();
        return requestKindPath(visibleKinds.includes(last) ? last : (visibleKinds[0] ?? last));
    };
    // desktopItems is every destination in menu order, so the dock takes the
    // first few of them and the rest go behind More.
    const dockItems = desktopItems.slice(0, DOCK_SLOTS);
    const dockMoreItems = desktopItems.slice(DOCK_SLOTS);
    const dockSelectedKey = dockItems.find(isCurrent)?.key;
    const dockMoreSelected = dockMoreItems.some(isCurrent);
    // Menu rows for the given destinations; the admin-only ones sit under a
    // "Configuration" heading.
    const configKeys = new Set(moreConfigNavItems.map((item) => item.key));
    const buildMoreMenu = (items: NavItem[]): MenuItem[] => {
        const menu: MenuItem[] = [];
        let headed = false;
        for (const item of items) {
            if (configKeys.has(item.key) && !headed) {
                headed = true;
                if (menu.length) menu.push({ type: 'divider' });
                menu.push({ type: 'label', label: 'Configuration' });
            }
            menu.push({
                key: navTarget(item),
                label: item.label,
                icon: item.icon,
                selected: isCurrent(item),
            });
        }
        return menu;
    };
    const profileMenuItems: MenuItem[] = [
        { type: 'label', label: me?.Name || userEmail, description: userEmail },
        { type: 'divider' },
        ...(isRegistered
            ? [{ key: profilePath, label: 'Profile', icon: <Icon name="user" /> }]
            : []),
        { key: 'logout', label: 'Log out', icon: <Icon name="logout" /> },
    ];

    const refresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            // The query cache is the only copy of the data: refetch whatever is
            // on screen, and the rest the next time it opens.
            await queryClient.invalidateQueries();
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
                        ref={navRef}
                        className="app-main-menu relative flex items-stretch gap-1 self-stretch">
                        {visibleItems.map((item) => (
                            <Link
                                key={item.key}
                                to={navTarget(item)}
                                aria-current={isCurrent(item) ? 'page' : undefined}
                                className={navTabClass(isCurrent(item))}>
                                {item.icon}
                                {item.label}
                            </Link>
                        ))}
                        {overflowItems.length > 0 && (
                            <DropdownMenu
                                className="flex items-stretch"
                                align="start"
                                items={buildMoreMenu(overflowItems)}
                                onSelect={navigate}>
                                <button
                                    type="button"
                                    aria-haspopup="menu"
                                    className={navTabClass(overflowItems.some(isCurrent))}>
                                    <Icon name="more" />
                                    More
                                    <Icon name="chevronDown" className="size-3.5" />
                                </button>
                            </DropdownMenu>
                        )}
                        {/* Hidden copy of every tab and the More button, measured to
                            decide how many tabs fit. */}
                        <div
                            ref={measureRef}
                            aria-hidden="true"
                            className="pointer-events-none invisible absolute flex h-0 w-max gap-1 overflow-hidden">
                            {[
                                ...desktopItems,
                                { key: 'more', label: 'More', icon: <Icon name="more" /> },
                            ].map((item) => (
                                <span key={item.key} className={cx(navTabClass(false), 'shrink-0')}>
                                    {item.icon}
                                    {item.label}
                                    {item.key === 'more' && (
                                        <Icon name="chevronDown" className="size-3.5" />
                                    )}
                                </span>
                            ))}
                        </div>
                    </nav>
                )}
                <div className="app-actions inline-flex items-center gap-2">
                    <div className="inline-flex items-center gap-0.5">
                        {isRegistered && (
                            <Button
                                type="text"
                                icon={<Icon name="reload" spin={refreshing} />}
                                onClick={() => void refresh()}
                                aria-label="Refresh app"
                                title="Refresh app"
                            />
                        )}
                        <Button
                            type="text"
                            icon={<Icon name={theme === 'dark' ? 'sun' : 'moon'} />}
                            onClick={toggleTheme}
                            aria-label={themeLabel}
                            title={themeLabel}
                        />
                    </div>
                    {userEmail && (
                        <DropdownMenu
                            items={profileMenuItems}
                            onSelect={(key) =>
                                key === 'logout' ? void signOutAndReload() : navigate(key)
                            }>
                            <button
                                type="button"
                                aria-haspopup="menu"
                                aria-label="Profile menu"
                                title={me?.Name || userEmail}
                                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-sm font-semibold text-accent transition-colors select-none hover:border-accent hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-md:size-11">
                                {initialsOf(me?.Name, userEmail)}
                            </button>
                        </DropdownMenu>
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
                    {dockItems.map((item) => (
                        <Link
                            key={item.key}
                            to={navTarget(item)}
                            aria-current={dockSelectedKey === item.key ? 'page' : undefined}
                            className={`app-mobile-nav-item${
                                dockSelectedKey === item.key ? ' is-selected' : ''
                            }`}>
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ))}
                    {dockMoreItems.length > 0 && (
                        <DropdownMenu
                            className="flex min-w-0 flex-1"
                            placement="top"
                            items={buildMoreMenu(dockMoreItems)}
                            onSelect={navigate}>
                            <button
                                type="button"
                                aria-haspopup="menu"
                                className={`app-mobile-nav-item w-full${
                                    dockMoreSelected ? ' is-selected' : ''
                                }`}>
                                <Icon name="more" />
                                <span>More</span>
                            </button>
                        </DropdownMenu>
                    )}
                </nav>
            )}
        </div>
    );
}
