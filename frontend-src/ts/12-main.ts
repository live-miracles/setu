// The last five are the Settings pages, reached from the navbar dropdown
// rather than the main nav — see 10-render-settings.ts.
type SectionKey =
    | 'home'
    | 'roster'
    | 'inventory'
    | 'programs'
    | 'tickets'
    | 'profile'
    | 'users'
    | 'departments'
    | 'places'
    | 'inventory-types'
    | 'home-content';

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
    users: renderUsers,
    departments: (c, d) => renderSettingsList(SETTINGS_LIST_PAGES.departments, c, d),
    places: (c, d) => renderSettingsList(SETTINGS_LIST_PAGES.places, c, d),
    'inventory-types': (c, d) => renderSettingsList(SETTINGS_LIST_PAGES['inventory-types'], c, d),
    'home-content': renderHomeContent,
};

// The admin-only Settings pages. Users sits alongside them in the dropdown
// but is readable by approvers too, so it isn't in this list.
const CONFIG_SECTIONS: SectionKey[] = ['departments', 'places', 'inventory-types', 'home-content'];

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
    const isRegistered = Boolean(dashboard.me.Phone);
    toggleNavVisibility(isRegistered);

    if (!isRegistered) {
        await renderRegistrationGate(container, dashboard);
        return;
    }

    const sectionKey = resolveSection(section, dashboard);
    await SECTION_RENDERERS[sectionKey](container, dashboard);
    renderNavActive(sectionKey);
    toggleRoleNavVisibility(dashboard);
}

// New sign-ins land with an empty Phone (see Auth.ts) until they fill in
// the registration form, so the nav must stay hidden — otherwise they could
// tap into other sections while their profile (department, etc.) is still
// unset.
function toggleNavVisibility(show: boolean): void {
    const desktopNav = document.getElementById('desktop-nav');
    const mobileDock = document.getElementById('mobile-dock');
    if (desktopNav) desktopNav.style.display = show ? '' : 'none';
    if (mobileDock) mobileDock.style.display = show ? '' : 'none';
}

// One of btn-active/dock-active/menu-active applies per element depending
// on where it lives (nav bar, mobile dock, Settings dropdown); the other two
// are inert there.
function renderNavActive(section: SectionKey): void {
    document.querySelectorAll('[data-nav-section]').forEach((el) => {
        const isActive = (el as HTMLElement).dataset.navSection === section;
        el.classList.toggle('btn-active', isActive);
        el.classList.toggle('dock-active', isActive);
        el.classList.toggle('menu-active', isActive);
    });
}

function renderNavIdentity(dashboard: DashboardPayload): void {
    const nameEl = document.getElementById('nav-user-name');
    const emailEl = document.getElementById('nav-user-email');
    if (nameEl) nameEl.textContent = dashboard.me.Name;
    if (emailEl) emailEl.textContent = dashboard.me.Email;
}

// Which sections the signed-in role may open at all. Home, Inventory,
// Programs and Profile are open to everyone; the rest are role-gated, and
// the backend enforces the same thing (requireApprover in Admin.ts and
// Roster.ts, requireAdmin for the config writes, requireTicketAccess in
// Tickets.ts).
function canOpenSection(section: SectionKey, me: UserDTO): boolean {
    if (CONFIG_SECTIONS.indexOf(section) !== -1) return canManageConfig(me);
    if (section === 'users' || section === 'roster') return canApprove(me);
    if (section === 'tickets') return canUseTickets(me);
    return true;
}

// A saved `?section=tickets` link (or the browser's back button) can name a
// section the signed-in role can't open — whose renderer would then make an
// API call it isn't allowed to make — so it resolves to Home instead of
// failing mid-render. Unknown keys (including the retired `admin`) land on
// Home the same way.
function resolveSection(section: string, dashboard: DashboardPayload): SectionKey {
    const key = (SECTION_RENDERERS[section as SectionKey] ? section : 'home') as SectionKey;
    return canOpenSection(key, dashboard.me) ? key : 'home';
}

// Hides the entries for sections this role can't open, wherever they appear
// — the desktop bar, the mobile dock and the Settings dropdown each render
// their own copy. The dropdown trigger carries no data-nav-section of its
// own, so it's hidden separately when nothing inside it is reachable.
function toggleRoleNavVisibility(dashboard: DashboardPayload): void {
    document.querySelectorAll<HTMLElement>('[data-nav-section]').forEach((el) => {
        const section = el.dataset.navSection as SectionKey;
        el.classList.toggle('hidden', !canOpenSection(section, dashboard.me));
    });
    const settingsMenu = document.getElementById('settings-menu');
    if (settingsMenu) settingsMenu.classList.toggle('hidden', !canApprove(dashboard.me));
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
