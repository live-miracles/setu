import { App as AntApp, Button, Dropdown, Layout, Menu, Space, Spin, Typography } from 'antd';
import {
    AppstoreOutlined,
    CalendarOutlined,
    InboxOutlined,
    ReloadOutlined,
    SettingOutlined,
    ToolOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import appLogo from '../../logo.png';
import { refreshDashboard } from '../router';
import { showErrorAlert } from './feedback';
import { getRandomQuote } from './quotes';

const { Header, Content } = Layout;

const settingsItems = [
    { key: 'roster', label: <span data-nav-section="roster">Roster</span> },
    { key: 'users', label: <span data-nav-section="users">Users</span> },
    { key: 'departments', label: <span data-nav-section="departments">Departments</span> },
    { key: 'places', label: <span data-nav-section="places">Places</span> },
    {
        key: 'inventory-types',
        label: <span data-nav-section="inventory-types">Inventory types</span>,
    },
    { key: 'blocks', label: <span data-nav-section="blocks">Blocks</span> },
    { key: 'home-content', label: <span data-nav-section="home-content">Other settings</span> },
];

function navigate(section: string) {
    document.querySelector<HTMLElement>(`[data-nav-section="${section}"]`)?.click();
}

function sectionFromUrl(): string {
    return new URLSearchParams(window.location.search).get('section') || 'home';
}

function Shell() {
    const [selectedSection, setSelectedSection] = useState(sectionFromUrl);
    const [refreshing, setRefreshing] = useState(false);
    const loadingQuote = getRandomQuote();

    useEffect(() => {
        const syncSelection = () => setSelectedSection(sectionFromUrl());
        window.addEventListener('setu:navigation', syncSelection);
        return () => window.removeEventListener('setu:navigation', syncSelection);
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
                        items={[
                            {
                                key: 'programs',
                                icon: <AppstoreOutlined />,
                                label: <span data-nav-section="programs">Programs</span>,
                            },
                            {
                                key: 'calendar',
                                icon: <CalendarOutlined />,
                                label: <span data-nav-section="calendar">Calendar</span>,
                            },
                            {
                                key: 'inventory',
                                icon: <InboxOutlined />,
                                label: <span data-nav-section="inventory">Inventory</span>,
                            },
                            {
                                key: 'tickets',
                                icon: <ToolOutlined />,
                                label: <span data-nav-section="tickets">Tickets</span>,
                            },
                        ]}
                        onClick={({ key }) => navigate(key)}
                    />
                    <Space className="app-actions">
                        <Dropdown
                            menu={{ items: settingsItems, onClick: ({ key }) => navigate(key) }}
                            trigger={['click']}>
                            <Button
                                type="text"
                                className="app-settings-button"
                                icon={<SettingOutlined />}
                                data-settings-menu
                                data-authenticated-nav
                                style={{ display: 'none' }}
                                aria-label="Settings">
                                <span className="app-settings-label">Settings</span>
                            </Button>
                        </Dropdown>
                        <Button
                            type="text"
                            className="app-profile-button"
                            icon={<UserOutlined />}
                            data-nav-section="profile"
                            data-authenticated-nav
                            style={{ display: 'none' }}
                            aria-label="Profile">
                            <span id="nav-user-name" />
                        </Button>
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
                <Content id="app-content" className="app-content">
                    <div className="app-loading" role="status" aria-live="polite">
                        <Spin size="large" />
                        <Typography.Text className="app-loading-quote">
                            “{loadingQuote}”
                        </Typography.Text>
                    </div>
                </Content>
                <nav
                    id="mobile-dock"
                    data-authenticated-nav
                    className="app-mobile-menu"
                    style={{ display: 'none' }}
                    aria-label="Main navigation">
                    {[
                        { key: 'programs', label: 'Programs', icon: <AppstoreOutlined /> },
                        { key: 'calendar', label: 'Calendar', icon: <CalendarOutlined /> },
                        { key: 'inventory', label: 'Inventory', icon: <InboxOutlined /> },
                        { key: 'tickets', label: 'Tickets', icon: <ToolOutlined /> },
                    ].map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={`app-mobile-nav-item${
                                selectedSection === item.key ? ' is-selected' : ''
                            }`}
                            onClick={() => navigate(item.key)}>
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
