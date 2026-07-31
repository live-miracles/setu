type SectionKey = 'home' | 'roster' | 'inventory' | 'tickets' | 'profile' | 'admin';

type SectionRenderer = (
    container: HTMLElement,
    dashboard: DashboardPayload,
) => Promise<void> | void;

const SECTION_RENDERERS: Record<SectionKey, SectionRenderer> = {
    home: renderHome,
    roster: renderRoster,
    inventory: renderInventory,
    tickets: renderTickets,
    profile: renderProfile,
    admin: renderAdmin,
};

async function refreshDashboard(): Promise<void> {
    const dashboard = await api.getDashboard();
    setState({ dashboard });
    await renderCurrentSection();
}

async function renderCurrentSection(): Promise<void> {
    const { dashboard, section } = getState();
    if (!dashboard) return;
    const container = document.getElementById('app-content');
    if (!container) return;
    const sectionKey = (SECTION_RENDERERS[section as SectionKey] ? section : 'home') as SectionKey;
    await SECTION_RENDERERS[sectionKey](container, dashboard);
    renderNavActive(sectionKey);
    renderNotificationBadge(dashboard);
    toggleAdminNavVisibility(dashboard);
}

function renderNavActive(section: SectionKey): void {
    document.querySelectorAll('[data-nav-section]').forEach((el) => {
        el.classList.toggle('btn-active', (el as HTMLElement).dataset.navSection === section);
    });
}

function toggleAdminNavVisibility(dashboard: DashboardPayload): void {
    const adminNav = document.querySelector('[data-nav-section="admin"]');
    if (adminNav) adminNav.classList.toggle('hidden', dashboard.me.Role !== 'admin');
}

function renderNotificationBadge(dashboard: DashboardPayload): void {
    const unread = dashboard.notifications.filter((n) => !n.ReadAt).length;
    const badge = document.getElementById('notification-count');
    if (!badge) return;
    badge.textContent = String(unread);
    badge.classList.toggle('hidden', unread === 0);
}

function navigateTo(section: SectionKey): void {
    setState({ section });
    const url = new URL(window.location.href);
    url.searchParams.set(APP_SECTION_QUERY_PARAM, section);
    window.history.replaceState({}, '', url.toString());
    renderCurrentSection();
}

function wireNav(): void {
    document.querySelectorAll('[data-nav-section]').forEach((el) => {
        el.addEventListener('click', () =>
            navigateTo((el as HTMLElement).dataset.navSection as SectionKey),
        );
    });
}

async function pollNotifications(): Promise<void> {
    if (document.visibilityState !== 'visible') return;
    const current = getState().dashboard;
    if (!current) return;
    try {
        const notifications = await api.listMyNotifications();
        setState({ dashboard: Object.assign({}, current, { notifications }) });
        renderNotificationBadge(getState().dashboard!);
    } catch (err) {
        // Polling failures shouldn't interrupt the user with an alert.
        console.error('Notification poll failed', err);
    }
}

async function boot(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const initialSection = (params.get(APP_SECTION_QUERY_PARAM) as SectionKey) || 'home';
    setState({ section: SECTION_RENDERERS[initialSection] ? initialSection : 'home' });

    wireNav();

    try {
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
        const container = document.getElementById('app-content');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
        }
        return;
    }

    window.setInterval(pollNotifications, NOTIFICATION_POLL_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', () => {
    boot();
});
