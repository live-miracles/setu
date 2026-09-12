import { App as AntApp, Button, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import {
    AppstoreOutlined,
    CalendarOutlined,
    InboxOutlined,
    ReloadOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import appLogo from '../../assets/logo.png';
import { useDashboard } from '../dashboard-context';
import {
    blocksPath,
    calendarPath,
    departmentsPath,
    homeContentPath,
    homePath,
    inventoryPath,
    inventoryTypesPath,
    placesPath,
    profilePath,
    programsPath,
    rosterPath,
    usersPath,
} from '../paths';
import { canApprove } from '../workflows';
import { currentUserEmail, signOutAndReload } from '../supabase';
import { showErrorAlert } from './feedback';
import { APP_LOADING_EVENT, AppLoading } from './app-loading';

const { Header, Content } = Layout;

type NavItem = { key: string; to: string; label: string; icon?: ReactNode };

const primaryNavItems: NavItem[] = [
    { key: 'programs', to: programsPath, label: 'Programs', icon: <AppstoreOutlined /> },
    { key: 'calendar', to: calendarPath, label: 'Calendar', icon: <CalendarOutlined /> },
    { key: 'inventory', to: inventoryPath, label: 'Inventory', icon: <InboxOutlined /> },
];

// The admin/approver-only entries below Profile in the account dropdown.
const configNavItems: NavItem[] = [
    { key: 'roster', to: rosterPath, label: 'Roster' },
    { key: 'users', to: usersPath, label: 'Users' },
    { key: 'departments', to: departmentsPath, label: 'Departments' },
    { key: 'places', to: placesPath, label: 'Places' },
    { key: 'inventory-types', to: inventoryTypesPath, label: 'Inventory types' },
    { key: 'blocks', to: blocksPath, label: 'Blocks' },
    { key: 'home-content', to: homeContentPath, label: 'Other settings' },
];

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
    const isPlaces = isPathSection(pathname, placesPath);
    const isInventoryTypes = isPathSection(pathname, inventoryTypesPath);
    const isSettings =
        isUsers ||
        isDepartments ||
        isPlaces ||
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
        isPlaces && 'app-content-places',
        isInventoryTypes && 'app-content-inventory-types',
        !isHome && !isEdgeToEdge && 'mx-auto',
        !isHome && !isEdgeToEdge && !isSettings && 'max-w-[50rem]',
    ]
        .filter(Boolean)
        .join(' ');
}

export function Shell({ children }: { children?: ReactNode }) {
    const { dashboard, refreshDashboard } = useDashboard();
    const location = useLocation();
    const navigate = useNavigate();
    const [refreshing, setRefreshing] = useState(false);
    const [appLoading, setAppLoading] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const isRegistered = Boolean(dashboard.me.Phone);
    const canOpenConfig = canApprove(dashboard.me);

    useEffect(() => {
        const syncAppLoading = (event: Event) =>
            setAppLoading((event as CustomEvent<boolean>).detail === true);
        window.addEventListener(APP_LOADING_EVENT, syncAppLoading);
        // Shell only ever mounts once boot() has confirmed a Supabase session
        // exists, so this reflects who is signed in even when the dashboard
        // call that fills in role/name fails (e.g. an access-restriction error).
        void currentUserEmail().then(setUserEmail);
        return () => window.removeEventListener(APP_LOADING_EVENT, syncAppLoading);
    }, []);

    const selectedKey = primaryNavItems.find((item) =>
        isPathSection(location.pathname, item.to),
    )?.key;
    const profileMenuItems = [
        { key: profilePath, label: 'Profile' },
        ...(canOpenConfig
            ? configNavItems.map((item) => ({ key: item.to, label: item.label }))
            : []),
    ];

    const refresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <AntApp>
            <Layout className="app-layout">
                <Header className="app-header">
                    <Button
                        type="text"
                        className="app-brand"
                        onClick={() => navigate(homePath)}
                        aria-label="Home">
                        <img className="app-brand-logo" src={appLogo} alt="" />
                        <Typography.Text strong>Setu</Typography.Text>
                    </Button>
                    {isRegistered && (
                        <Menu
                            id="desktop-nav"
                            mode="horizontal"
                            className="app-main-menu"
                            selectedKeys={selectedKey ? [selectedKey] : []}
                            items={primaryNavItems.map((item) => ({
                                key: item.key,
                                icon: item.icon,
                                label: item.label,
                            }))}
                            onClick={({ key }) => {
                                const item = primaryNavItems.find((i) => i.key === key);
                                if (item) navigate(item.to);
                            }}
                        />
                    )}
                    <Space className="app-actions">
                        {userEmail && (
                            <Dropdown
                                menu={{
                                    items: [
                                        ...(isRegistered ? profileMenuItems : []),
                                        { type: 'divider' },
                                        { key: 'logout', label: 'Log out' },
                                    ],
                                    onClick: ({ key }) =>
                                        key === 'logout' ? void signOutAndReload() : navigate(key),
                                }}
                                trigger={['click']}>
                                <span>
                                    <Button
                                        type="text"
                                        className="app-profile-button"
                                        icon={<UserOutlined />}
                                        aria-label="Account menu"
                                        title={userEmail}>
                                        <span>{dashboard.me.Name || userEmail}</span>
                                    </Button>
                                </span>
                            </Dropdown>
                        )}
                        {isRegistered && (
                            <Button
                                type="text"
                                icon={<ReloadOutlined spin={refreshing} />}
                                onClick={() => void refresh()}
                                aria-label="Refresh app"
                                title="Refresh app"
                            />
                        )}
                    </Space>
                </Header>
                <Content className={contentClassName(location.pathname)}>
                    {children ?? <Outlet />}
                </Content>
                {appLoading && <AppLoading />}
                {isRegistered && (
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
            </Layout>
        </AntApp>
    );
}
