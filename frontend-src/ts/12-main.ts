type SectionKey =
    | 'home'
    | 'roster'
    | 'inventory'
    | 'programs'
    | 'tickets'
    | 'profile'
    | 'admin';

type SectionRenderer = (
    container: HTMLElement,
    dashboard: DashboardPayload,
) => Promise<void> | void;

const SECTION_RENDERERS: Record<SectionKey, SectionRenderer> = {
    home: renderHome,
    roster: renderRoster,
    inventory: renderInventory,
    programs: renderPrograms,
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

    renderNavIdentity(dashboard);
    toggleNavVisibility(dashboard.me.Registered);

    if (!dashboard.me.Registered) {
        await renderRegistrationGate(container, dashboard);
        return;
    }

    const sectionKey = (SECTION_RENDERERS[section as SectionKey] ? section : 'home') as SectionKey;
    await SECTION_RENDERERS[sectionKey](container, dashboard);
    renderNavActive(sectionKey);
    toggleAdminNavVisibility(dashboard);
}

// New sign-ins land with Registered: false (see Auth.ts) until they fill in
// the registration form, so the nav must stay hidden — otherwise they could
// tap into other sections while their profile (department, etc.) is still
// unset.
function toggleNavVisibility(show: boolean): void {
    const desktopNav = document.getElementById('desktop-nav');
    const mobileDock = document.getElementById('mobile-dock');
    if (desktopNav) desktopNav.style.display = show ? '' : 'none';
    if (mobileDock) mobileDock.style.display = show ? '' : 'none';
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
}

document.addEventListener('DOMContentLoaded', () => {
    boot();
});
