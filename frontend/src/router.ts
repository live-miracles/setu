import { api } from './api';
import {
    APP_SECTION_QUERY_PARAM,
    INVENTORY_REQUEST_QUERY_PARAM,
    PROGRAM_REQUEST_QUERY_PARAM,
    TICKET_QUERY_PARAM,
    WORKBENCH_DIRECTION_QUERY_PARAM,
    WORKBENCH_MODE_QUERY_PARAM,
    WORKBENCH_SEARCH_QUERY_PARAM,
    WORKBENCH_SORT_QUERY_PARAM,
    WORKBENCH_STATUS_QUERY_PARAM,
    WORKBENCH_VIEW_QUERY_PARAM,
} from './config';
import { getState, setState } from './state';
import { canApprove, canManageConfig, canUseTickets } from './workflows';
import { unmountRefinePage } from './ui/refine';

// The routing core: it owns navigation, role gating and the nav chrome, but
// deliberately imports no section. The table of renderers is handed to it by
// main.ts via initRouter(), which is what keeps the dependency graph acyclic
// — sections import navigation helpers from here, and nothing here reaches
// back into them.

// Settings pages are reached from the navbar dropdown rather than the main nav.
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
    | 'blocks'
    | 'home-content';

type SectionRenderer = (
    container: HTMLElement,
    dashboard: DashboardPayload,
) => Promise<void> | void;

export interface RouterConfig {
    sections: Record<SectionKey, SectionRenderer>;
    // Shown in place of the whole app until a new sign-in fills in their
    // profile, so it is a renderer like any other rather than a special case.
    registrationGate: SectionRenderer;
}

let config: RouterConfig | null = null;
let lastRenderedLocation = '';

export function initRouter(routerConfig: RouterConfig): void {
    config = routerConfig;
}

function requireConfig(): RouterConfig {
    if (!config) throw new Error('initRouter() must be called before rendering.');
    return config;
}

// The admin-only Settings pages. Users sits alongside them in the dropdown
// but is readable by approvers too, so it isn't in this list.
const CONFIG_SECTIONS: SectionKey[] = ['departments', 'places', 'inventory-types', 'home-content'];

export async function refreshDashboard(): Promise<void> {
    const dashboard = await api.getDashboard();
    setState({ dashboard });
    await renderCurrentSection();
}

export async function renderCurrentSection(): Promise<void> {
    const { dashboard, section } = getState();
    if (!dashboard) return;
    const container = document.getElementById('app-content');
    if (!container) return;
    const renderLocation = window.location.pathname + window.location.search;
    if (renderLocation !== lastRenderedLocation) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
        lastRenderedLocation = renderLocation;
    }

    const { sections, registrationGate } = requireConfig();
    renderNavIdentity(dashboard);
    const isRegistered = Boolean(dashboard.me.Phone);
    toggleNavVisibility(isRegistered);

    if (!isRegistered) {
        await registrationGate(container, dashboard);
        return;
    }

    const sectionKey = resolveSection(section, dashboard);
    const params = new URLSearchParams(window.location.search);
    const isWorkbenchSection = ['inventory', 'programs', 'tickets'].indexOf(sectionKey) !== -1;
    const isWorkbenchDetail =
        isWorkbenchSection &&
        (params.get(WORKBENCH_MODE_QUERY_PARAM) === 'create' ||
            Boolean(params.get(INVENTORY_REQUEST_QUERY_PARAM)) ||
            Boolean(params.get(PROGRAM_REQUEST_QUERY_PARAM)) ||
            Boolean(params.get(TICKET_QUERY_PARAM)));
    const isWorkbenchBrowse =
        isWorkbenchSection &&
        !params.get(WORKBENCH_MODE_QUERY_PARAM) &&
        !params.get(INVENTORY_REQUEST_QUERY_PARAM) &&
        !params.get(PROGRAM_REQUEST_QUERY_PARAM) &&
        !params.get(TICKET_QUERY_PARAM);
    const isHome = sectionKey === 'home';
    const isSettingsSection = [
        'users',
        'departments',
        'places',
        'inventory-types',
        'blocks',
        'home-content',
    ].includes(sectionKey);
    const isEdgeToEdge = isWorkbenchBrowse || isWorkbenchDetail;
    container.classList.toggle('app-content-home', isHome);
    container.classList.toggle('app-content-edge', isEdgeToEdge);
    container.classList.toggle('mx-auto', !isHome && !isEdgeToEdge);
    container.classList.toggle('max-w-[50rem]', !isHome && !isEdgeToEdge && !isSettingsSection);
    container.classList.toggle('max-w-[70rem]', isSettingsSection);
    container.classList.toggle('max-w-[100rem]', isEdgeToEdge);
    unmountRefinePage(container);
    await sections[sectionKey](container, dashboard);
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

function renderNavIdentity(dashboard: DashboardPayload): void {
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl) nameEl.textContent = dashboard.me.Name;
}

// Which sections the signed-in role may open at all. Home, Inventory,
// Programs and Profile are open to everyone; the rest are role-gated, and
// the backend enforces the same thing (requireApprover in Admin.ts and
// Roster.ts, requireAdmin for the config writes, requireTicketAccess in
// Tickets.ts).
function canOpenSection(section: SectionKey, me: UserDTO): boolean {
    if (CONFIG_SECTIONS.indexOf(section) !== -1) return canManageConfig(me);
    if (section === 'users' || section === 'roster' || section === 'blocks') return canApprove(me);
    if (section === 'tickets') return canUseTickets(me);
    return true;
}

// A saved `?section=tickets` link (or the browser's back button) can name a
// section the signed-in role can't open — whose renderer would then make an
// API call it isn't allowed to make — so it resolves to Home instead of
// failing mid-render. Unknown keys (including the retired `admin`) land on
// Home the same way.
function resolveSection(section: string, dashboard: DashboardPayload): SectionKey {
    const key = (requireConfig().sections[section as SectionKey] ? section : 'home') as SectionKey;
    return canOpenSection(key, dashboard.me) ? key : 'home';
}

// Hides the entries for sections this role can't open, wherever they appear
// — the desktop bar, the mobile dock and the Settings dropdown each render
// their own copy. The dropdown trigger carries no data-nav-section of its
// own, so it's hidden separately when nothing inside it is reachable.
function toggleRoleNavVisibility(dashboard: DashboardPayload): void {
    const showSettings = canApprove(dashboard.me);
    document.querySelectorAll<HTMLElement>('[data-nav-section]').forEach((el) => {
        const section = el.dataset.navSection as SectionKey;
        el.classList.toggle('hidden', !canOpenSection(section, dashboard.me));
    });
    document.querySelectorAll<HTMLElement>('[data-settings-menu]').forEach((el) => {
        el.classList.toggle('hidden', !showSettings);
    });
}

const WORKBENCH_QUERY_PARAMS = [
    INVENTORY_REQUEST_QUERY_PARAM,
    PROGRAM_REQUEST_QUERY_PARAM,
    TICKET_QUERY_PARAM,
    WORKBENCH_MODE_QUERY_PARAM,
    WORKBENCH_VIEW_QUERY_PARAM,
    WORKBENCH_SEARCH_QUERY_PARAM,
    WORKBENCH_STATUS_QUERY_PARAM,
    WORKBENCH_SORT_QUERY_PARAM,
    WORKBENCH_DIRECTION_QUERY_PARAM,
    'equipment',
    'place',
    'period',
    'assignee',
];

interface NavigationOptions {
    selectedParam?: string;
    selectedId?: string;
    mode?: string;
    preserveWorkbench?: boolean;
    replace?: boolean;
}

function navigateTo(section: SectionKey, options: NavigationOptions = {}): void {
    (document.activeElement as HTMLElement | null)?.blur();
    const previousSection = getState().section;
    setState({ section });
    const url = new URL(window.location.href);
    url.searchParams.set(APP_SECTION_QUERY_PARAM, section);
    if (!options.preserveWorkbench || previousSection !== section) {
        WORKBENCH_QUERY_PARAMS.forEach((param) => url.searchParams.delete(param));
    } else {
        url.searchParams.delete(INVENTORY_REQUEST_QUERY_PARAM);
        url.searchParams.delete(PROGRAM_REQUEST_QUERY_PARAM);
        url.searchParams.delete(TICKET_QUERY_PARAM);
        url.searchParams.delete(WORKBENCH_MODE_QUERY_PARAM);
    }
    if (options.selectedParam && options.selectedId) {
        url.searchParams.set(options.selectedParam, options.selectedId);
    }
    if (options.mode) url.searchParams.set(WORKBENCH_MODE_QUERY_PARAM, options.mode);
    const state = {
        setu: true,
        section,
        parentSection: options.selectedId || options.mode ? section : undefined,
    };
    if (options.replace) window.history.replaceState(state, '', url.toString());
    else window.history.pushState(state, '', url.toString());
    renderCurrentSection();
}

export function navigateToInventoryRequest(requestId: string): void {
    navigateTo('inventory', {
        selectedParam: INVENTORY_REQUEST_QUERY_PARAM,
        selectedId: requestId,
        preserveWorkbench: true,
    });
}

export function navigateToInventoryRequests(): void {
    navigateBackToWorkbench('inventory');
}

export function navigateToInventoryCreate(): void {
    navigateTo('inventory', { mode: 'create', preserveWorkbench: true });
}

export function navigateToProgram(programId: string): void {
    navigateTo('programs', {
        selectedParam: PROGRAM_REQUEST_QUERY_PARAM,
        selectedId: programId,
        preserveWorkbench: true,
    });
}

export function navigateToPrograms(): void {
    navigateBackToWorkbench('programs');
}

export function navigateToProgramCreate(): void {
    navigateTo('programs', { mode: 'create', preserveWorkbench: true });
}

export function navigateToTicket(ticketId: string): void {
    navigateTo('tickets', {
        selectedParam: TICKET_QUERY_PARAM,
        selectedId: ticketId,
        preserveWorkbench: true,
    });
}

export function navigateToTickets(): void {
    navigateBackToWorkbench('tickets');
}

export function navigateToTicketCreate(): void {
    navigateTo('tickets', { mode: 'create', preserveWorkbench: true });
}

function navigateBackToWorkbench(section: SectionKey): void {
    if (window.history.state?.parentSection === section) {
        window.history.back();
        return;
    }
    navigateTo(section, { preserveWorkbench: true, replace: true });
}

export function replaceWorkbenchUrl(url: URL): void {
    const section = url.searchParams.get(APP_SECTION_QUERY_PARAM) || getState().section;
    window.history.replaceState({ setu: true, section }, '', url.toString());
}

// One delegated listener covers both the nav chrome in the page shell and
// the cross-section links a section renders into its own innerHTML (e.g.
// "View roster" on Home) — those are replaced on every render, so binding
// them individually would mean re-wiring after each one.
export function wireNav(): void {
    if (!window.history.state?.setu) {
        window.history.replaceState(
            { setu: true, section: getState().section },
            '',
            window.location.href,
        );
    }
    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        const el = target?.closest<HTMLElement>('[data-nav-section]');
        if (el) navigateTo(el.dataset.navSection as SectionKey);
    });
    window.addEventListener('popstate', () => {
        const params = new URLSearchParams(window.location.search);
        setState({ section: params.get(APP_SECTION_QUERY_PARAM) || 'home' });
        renderCurrentSection();
    });
}
