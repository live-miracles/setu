import { App as AntApp, Button, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import {
    AppstoreOutlined,
    CalendarOutlined,
    InboxOutlined,
    ReloadOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { createRoot } from 'react-dom/client';
import { useEffect, useState, type ReactNode } from 'react';
import appLogo from '../../assets/logo.png';
import { refreshDashboard, type SectionKey } from '../router';
import { currentUserEmail, signOutAndReload } from '../supabase';
import { showErrorAlert } from './feedback';
import { APP_LOADING_EVENT, AppLoading } from './app-loading';

const { Header, Content } = Layout;

type NavItem = { key: SectionKey; label: string; icon?: ReactNode };

const primaryNavItems: NavItem[] = [
    { key: 'programs', label: 'Programs', icon: <AppstoreOutlined /> },
    { key: 'calendar', label: 'Calendar', icon: <CalendarOutlined /> },
    { key: 'inventory', label: 'Inventory', icon: <InboxOutlined /> },
];

const profileNavItems: NavItem[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'roster', label: 'Roster' },
    { key: 'users', label: 'Users' },
    { key: 'departments', label: 'Departments' },
    { key: 'places', label: 'Places' },
    { key: 'inventory-types', label: 'Inventory types' },
    { key: 'blocks', label: 'Blocks' },
    { key: 'home-content', label: 'Other settings' },
];

function navLabel(item: NavItem) {
    return <span data-nav-section={item.key}>{item.label}</span>;
}

function profileMenuItems(role: UserRole | null) {
    const visibleItems =
        role === 'admin' || role === 'approver'
            ? profileNavItems
            : profileNavItems.filter((item) => item.key === 'profile');
    return visibleItems.map((item) => ({ key: item.key, label: navLabel(item) }));
}

function navigate(section: string) {
    document.querySelector<HTMLElement>(`[data-nav-section="${section}"]`)?.click();
}

function sectionFromUrl(): string {
    return new URLSearchParams(window.location.search).get('section') || 'home';
}

function Shell() {
    const [selectedSection, setSelectedSection] = useState(sectionFromUrl);
    const [role, setRole] = useState<UserRole | null>(null);
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [appLoading, setAppLoading] = useState(true);
    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        const syncSelection = () => setSelectedSection(sectionFromUrl());
        window.addEventListener('setu:navigation', syncSelection);
        const syncRole = () => {
            setRole((document.documentElement.dataset.userRole as UserRole | undefined) || null);
            setDisplayName(document.documentElement.dataset.userName || null);
        };
        window.addEventListener('setu:role', syncRole);
        const syncAppLoading = (event: Event) =>
            setAppLoading((event as CustomEvent<boolean>).detail === true);
        window.addEventListener(APP_LOADING_EVENT, syncAppLoading);
        syncRole();
        // Shell only ever mounts once boot() has confirmed a Supabase session
        // exists, so this reflects who is signed in even when the dashboard
        // call that fills in role/name fails (e.g. an access-restriction error).
        void currentUserEmail().then(setUserEmail);
        return () => {
            window.removeEventListener('setu:navigation', syncSelection);
            window.removeEventListener('setu:role', syncRole);
            window.removeEventListener(APP_LOADING_EVENT, syncAppLoading);
        };
    }, []);

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
                    <Button type="text" className="app-brand" data-nav-section="home">
                        <img className="app-brand-logo" src={appLogo} alt="" />
                        <Typography.Text strong>Setu</Typography.Text>
                    </Button>
                    <Menu
                        id="desktop-nav"
                        data-authenticated-nav
                        mode="horizontal"
                        className="app-main-menu"
                        style={{ display: 'none' }}
                        selectedKeys={[selectedSection]}
                        items={primaryNavItems.map((item) => ({
                            key: item.key,
                            icon: item.icon,
                            label: navLabel(item),
                        }))}
                        onClick={({ key }) => navigate(key)}
                    />
                    <Space className="app-actions">
                        {userEmail && (
                            <Dropdown
                                menu={{
                                    items: [
                                        ...profileMenuItems(role),
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
                                        <span>{displayName ?? userEmail}</span>
                                    </Button>
                                </span>
                            </Dropdown>
                        )}
                        <Button
                            type="text"
                            icon={<ReloadOutlined spin={refreshing} />}
                            data-authenticated-nav
                            onClick={() => void refresh()}
                            aria-label="Refresh app"
                            title="Refresh app"
                        />
                    </Space>
                </Header>
                <Content id="app-content" className="app-content" />
                {/* The router replaces #app-content's children imperatively, so the
                    overlay has to sit outside it — React can only unmount nodes that
                    are still where it left them. */}
                {appLoading && <AppLoading />}
                <nav
                    id="mobile-dock"
                    data-authenticated-nav
                    className="app-mobile-menu"
                    style={{ display: 'none' }}
                    aria-label="Main navigation">
                    {primaryNavItems.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            data-nav-section={item.key}
                            className={`app-mobile-nav-item${
                                selectedSection === item.key ? ' is-selected' : ''
                            }`}>
                            {item.icon}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
            </Layout>
        </AntApp>
    );
}

export function mountAppShell(): void {
    const container = document.getElementById('app-shell');
    if (container) createRoot(container).render(<Shell />);
}
