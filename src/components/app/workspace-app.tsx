'use client';

import {
    BellOutlined,
    CalendarOutlined,
    ControlOutlined,
    HomeOutlined,
    InboxOutlined,
    NotificationOutlined,
    SettingOutlined,
    ToolOutlined,
    UserOutlined,
    WifiOutlined,
} from '@ant-design/icons';
import { App as AntApp, Avatar, Badge, Button, Drawer, Layout, Menu, Space, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDemoStore } from '@/demo/store';
import { isDemoMode } from '@/lib/env';
import type { DemoState } from '@/domain/types';
import { HomeSection } from './home-section';
import { RosterSection } from './roster-section';
import { InventorySection } from './inventory-section';
import { TicketsSection } from './tickets-section';
import { ProfileSection } from './profile-section';
import { AdminSection } from './admin-section';

const { Sider } = Layout;

export type SectionKey = 'home' | 'roster' | 'inventory' | 'tickets' | 'profile' | 'admin';

const mainNav = [
    { key: 'home', label: 'Home', icon: <HomeOutlined /> },
    { key: 'roster', label: 'Roster', icon: <CalendarOutlined /> },
    { key: 'inventory', label: 'Inventory', icon: <InboxOutlined /> },
    { key: 'tickets', label: 'Tickets', icon: <ToolOutlined /> },
    { key: 'profile', label: 'Profile', icon: <UserOutlined /> },
] satisfies MenuProps['items'];

const pageMeta: Record<SectionKey, { title: string; subtitle: string }> = {
    home: { title: 'Good morning', subtitle: 'Here is today’s operations pulse.' },
    roster: {
        title: 'Roster',
        subtitle: 'Plan shifts and keep the team aligned.',
    },
    inventory: {
        title: 'Inventory',
        subtitle: 'Request, issue and return equipment.',
    },
    tickets: {
        title: 'Tickets',
        subtitle: 'Track operational issues through resolution.',
    },
    profile: {
        title: 'Profile',
        subtitle: 'Your contact details and notification preferences.',
    },
    admin: {
        title: 'Admin',
        subtitle: 'People, master data and app settings.',
    },
};

export function WorkspaceApp() {
    return (
        <AntApp>
            <WorkspaceInner />
        </AntApp>
    );
}

function WorkspaceInner() {
    const { state, actions } = useDemoStore();
    const { message } = AntApp.useApp();
    const [section, setSection] = useState<SectionKey>('home');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [online, setOnline] = useState(true);
    const [ready, setReady] = useState(isDemoMode);
    const [installEvent, setInstallEvent] = useState<Event | null>(null);
    const [renderedAt] = useState(() => Date.now());

    const unread = state.notifications.filter((notification) => !notification.read).length;
    const activeSection =
        section === 'admin' && state.currentUser.role !== 'admin' ? 'home' : section;

    const navigate = useCallback((key: SectionKey) => {
        setSection(key);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('section') as SectionKey | null;
        queueMicrotask(() => {
            if (requested && pageMeta[requested]) setSection(requested);
            setOnline(navigator.onLine);
        });
        const onOnline = () => setOnline(true);
        const onOffline = () => setOnline(false);
        const onInstall = (event: Event) => {
            event.preventDefault();
            setInstallEvent(event);
        };

        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        window.addEventListener('beforeinstallprompt', onInstall);

        if ('serviceWorker' in navigator) {
            void navigator.serviceWorker.register('/sw.js');
        }

        if (!isDemoMode) {
            void fetch('/api/v1/dashboard', { cache: 'no-store' })
                .then(async (response) => {
                    if (response.status === 401 || response.status === 403) {
                        window.location.assign('/login?error=not-approved');
                        return null;
                    }
                    if (!response.ok) throw new Error('Live workspace could not be loaded.');
                    const body = (await response.json()) as { data: DemoState };
                    actions.hydrate(body.data);
                    setReady(true);
                    return null;
                })
                .catch((error: unknown) => {
                    message.error(
                        error instanceof Error
                            ? error.message
                            : 'Live workspace could not be loaded.',
                    );
                });
        }

        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('beforeinstallprompt', onInstall);
        };
    }, [actions, message]);

    const requestInstall = async () => {
        if (!installEvent) {
            message.info('Use your browser menu and choose “Add to Home Screen” or “Install App”.');
            return;
        }
        const promptEvent = installEvent as Event & {
            prompt: () => Promise<void>;
        };
        await promptEvent.prompt();
        setInstallEvent(null);
    };

    const content = useMemo(() => {
        switch (activeSection) {
            case 'roster':
                return <RosterSection />;
            case 'inventory':
                return <InventorySection />;
            case 'tickets':
                return <TicketsSection />;
            case 'profile':
                return <ProfileSection onNavigate={navigate} />;
            case 'admin':
                return <AdminSection />;
            default:
                return <HomeSection onNavigate={navigate} />;
        }
    }, [activeSection, navigate]);

    const menuItems = [
        ...mainNav,
        ...(state.currentUser.role === 'admin'
            ? [
                  { type: 'divider' as const },
                  { key: 'admin', label: 'Admin', icon: <SettingOutlined /> },
              ]
            : []),
    ];

    return (
        <div className="workspace">
            {!online && (
                <div className="offline-banner" role="status">
                    <WifiOutlined />
                    You are offline. Live data and all changes are unavailable.
                </div>
            )}

            <Sider width={250} className="workspace-sider">
                <div className="brand">
                    <Image src="/icons/icon-192.png" alt="" width={46} height={46} priority />
                    <div className="brand-copy">
                        <strong>Livestream Ops</strong>
                        <span>Control room</span>
                    </div>
                </div>
                <Menu
                    mode="inline"
                    theme="dark"
                    selectedKeys={[activeSection]}
                    items={menuItems}
                    onClick={({ key }) => navigate(key as SectionKey)}
                    className="side-menu"
                />
                <button className="sider-profile" onClick={() => navigate('profile')} type="button">
                    <Avatar style={{ background: '#ff6257' }}>
                        {state.currentUser.name.slice(0, 1)}
                    </Avatar>
                    <span className="sider-profile-copy">
                        <strong>{state.currentUser.name}</strong>
                        <span>{state.currentUser.role}</span>
                    </span>
                </button>
            </Sider>

            <main className="workspace-main">
                <header className="topbar">
                    <div className="topbar-title">
                        <h1>{pageMeta[activeSection].title}</h1>
                        <p>{pageMeta[activeSection].subtitle}</p>
                    </div>
                    <div className="topbar-actions">
                        <span className="demo-pill desktop-only">
                            {isDemoMode ? 'Demo workspace' : 'Live workspace'}
                        </span>
                        <Tooltip title="Install this app">
                            <Button
                                className="desktop-only"
                                icon={<ControlOutlined />}
                                onClick={() => void requestInstall()}>
                                Install
                            </Button>
                        </Tooltip>
                        <Badge count={unread} size="small">
                            <Button
                                aria-label="Open notifications"
                                icon={<BellOutlined />}
                                onClick={() => setDrawerOpen(true)}
                            />
                        </Badge>
                    </div>
                </header>

                <div className="content" aria-live="polite">
                    {!ready ? (
                        <section className="surface-card" style={{ padding: 32 }}>
                            <h2>Loading live workspace…</h2>
                            <p style={{ color: '#73767d' }}>
                                Fetching the latest roster, inventory and tickets.
                            </p>
                        </section>
                    ) : online ? (
                        content
                    ) : (
                        <section className="surface-card" style={{ padding: 32 }}>
                            <WifiOutlined style={{ fontSize: 28, color: '#e04f5f' }} />
                            <h2>Connection required</h2>
                            <p style={{ color: '#73767d', maxWidth: 520 }}>
                                Livestream Operations does not keep offline business data. Reconnect
                                to load current roster, inventory and ticket information.
                            </p>
                        </section>
                    )}
                </div>
            </main>

            <nav className="mobile-bottom-nav" aria-label="Primary navigation">
                {mainNav.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        className={`mobile-nav-item ${activeSection === item.key ? 'active' : ''}`}
                        onClick={() => navigate(item.key as SectionKey)}
                        aria-current={activeSection === item.key ? 'page' : undefined}>
                        <div>
                            {item.icon}
                            <span>{item.label}</span>
                        </div>
                    </button>
                ))}
            </nav>

            <Drawer
                title={
                    <Space>
                        <NotificationOutlined />
                        Notifications
                    </Space>
                }
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                size="default"
                extra={
                    unread > 0 ? (
                        <Button
                            type="link"
                            size="small"
                            onClick={() => void actions.markNotificationsRead()}>
                            Mark all read
                        </Button>
                    ) : null
                }>
                <div className="list-stack">
                    {state.notifications.map((notification) => (
                        <button
                            key={notification.id}
                            type="button"
                            className="request-row"
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                cursor: 'pointer',
                                background: notification.read ? '#fff' : '#fff5f2',
                            }}
                            onClick={() => {
                                const target = new URL(
                                    notification.href,
                                    window.location.origin,
                                ).searchParams.get('section') as SectionKey | null;
                                if (target) navigate(target);
                                setDrawerOpen(false);
                            }}>
                            <span>
                                <span className="request-id">
                                    {new Intl.RelativeTimeFormat('en', {
                                        numeric: 'auto',
                                    }).format(
                                        -Math.max(
                                            1,
                                            Math.round(
                                                (renderedAt -
                                                    new Date(notification.createdAt).getTime()) /
                                                    86_400_000,
                                            ),
                                        ),
                                        'day',
                                    )}
                                </span>
                                <h4>{notification.title}</h4>
                                <div className="request-items">{notification.message}</div>
                            </span>
                            {!notification.read && <Badge status="processing" color="#ff6257" />}
                        </button>
                    ))}
                </div>
            </Drawer>
        </div>
    );
}
