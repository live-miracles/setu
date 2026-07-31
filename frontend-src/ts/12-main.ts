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
    renderNavIdentity(dashboard);
    renderNotificationBadge(dashboard);
    renderNotificationPanel(dashboard);
    toggleAdminNavVisibility(dashboard);
}

function renderNavActive(section: SectionKey): void {
    document.querySelectorAll('[data-nav-section]').forEach((el) => {
        const isActive = (el as HTMLElement).dataset.navSection === section;
        el.classList.toggle('btn-active', isActive);
        el.classList.toggle('dock-active', isActive);
    });
}

function renderNavIdentity(dashboard: DashboardPayload): void {
    const nameEl = document.getElementById('nav-user-name');
    const emailEl = document.getElementById('nav-user-email');
    if (nameEl) nameEl.textContent = dashboard.me.Name;
    if (emailEl) emailEl.textContent = dashboard.me.Email;
}

function toggleAdminNavVisibility(dashboard: DashboardPayload): void {
    document
        .querySelectorAll('[data-nav-section="admin"]')
        .forEach((el) => el.classList.toggle('hidden', dashboard.me.Role !== 'admin'));
}

function renderNotificationBadge(dashboard: DashboardPayload): void {
    const unread = dashboard.notifications.filter((n) => !n.ReadAt).length;
    const badge = document.getElementById('notification-count');
    if (!badge) return;
    badge.textContent = String(unread);
    badge.classList.toggle('hidden', unread === 0);
}

function renderNotificationPanel(dashboard: DashboardPayload): void {
    const panel = document.getElementById('notification-panel');
    const markAllButton = document.getElementById('mark-all-notifications-read');
    if (!panel) return;

    const sorted = [...dashboard.notifications].sort(
        (a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime(),
    );
    const unreadCount = sorted.filter((n) => !n.ReadAt).length;
    if (markAllButton) markAllButton.classList.toggle('hidden', unreadCount === 0);

    panel.innerHTML =
        sorted.length === 0
            ? renderEmptyState('inbox', "You're all caught up.")
            : sorted
                  .slice(0, 20)
                  .map(
                      (n) => `
              <button type="button" class="flex w-full items-start gap-2 rounded-box px-2 py-2 text-left hover:bg-base-200 ${n.ReadAt ? '' : 'bg-primary/5'}" data-notification-id="${n.Id}" data-href="${escapeHtml(n.Href)}">
                <span class="mt-1.5 size-1.5 shrink-0 rounded-full ${n.ReadAt ? '' : 'bg-primary'}"></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">${escapeHtml(n.Title)}</span>
                  <span class="block truncate text-xs text-base-content/60">${escapeHtml(n.Message)}</span>
                  <span class="block text-xs text-base-content/40">${timeAgo(n.CreatedAt)}</span>
                </span>
              </button>`,
                  )
                  .join('');

    panel.querySelectorAll<HTMLElement>('[data-notification-id]').forEach((el) => {
        el.addEventListener('click', async () => {
            const id = el.dataset.notificationId!;
            const href = el.dataset.href || '';
            (document.activeElement as HTMLElement | null)?.blur();

            const current = getState().dashboard;
            if (current && !current.notifications.find((n) => n.Id === id)?.ReadAt) {
                setState({
                    dashboard: Object.assign({}, current, {
                        notifications: current.notifications.map((n) =>
                            n.Id === id
                                ? Object.assign({}, n, { ReadAt: new Date().toISOString() })
                                : n,
                        ),
                    }),
                });
                renderNotificationBadge(getState().dashboard!);
                renderNotificationPanel(getState().dashboard!);
                api.markNotificationRead(id).catch((err) => console.error('Mark read failed', err));
            }

            const targetSection = new URL(href, window.location.href).searchParams.get(
                APP_SECTION_QUERY_PARAM,
            ) as SectionKey | null;
            if (targetSection && SECTION_RENDERERS[targetSection]) navigateTo(targetSection);
        });
    });

    if (markAllButton) {
        markAllButton.onclick = async () => {
            const dashboardNow = getState().dashboard;
            if (!dashboardNow) return;
            const unread = dashboardNow.notifications.filter((n) => !n.ReadAt);
            try {
                await Promise.all(unread.map((n) => api.markNotificationRead(n.Id)));
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            }
        };
    }
}

function navigateTo(section: SectionKey): void {
    (document.activeElement as HTMLElement | null)?.blur();
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
        renderNotificationPanel(getState().dashboard!);
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
