import { api } from './api';
import {
    APP_SECTION_QUERY_PARAM,
    DEPARTMENT_QUERY_PARAM,
    INVENTORY_TYPE_QUERY_PARAM,
    INVENTORY_REQUEST_QUERY_PARAM,
    PLACE_QUERY_PARAM,
    PROGRAM_REQUEST_QUERY_PARAM,
    TICKET_QUERY_PARAM,
    USER_QUERY_PARAM,
    WORKBENCH_DIRECTION_QUERY_PARAM,
    WORKBENCH_MODE_QUERY_PARAM,
    WORKBENCH_SEARCH_QUERY_PARAM,
    WORKBENCH_SORT_QUERY_PARAM,
    WORKBENCH_STATUS_QUERY_PARAM,
    WORKBENCH_VIEW_QUERY_PARAM,
} from './config';
import { getState, setState } from './state';
import { canApprove, canUseTickets } from './workflows';
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
    | 'calendar'
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
let appsScriptHistoryReady = false;

type AppsScriptLocation = {
    hash?: string;
    parameter?: Record<string, string>;
    parameters?: Record<string, string[]>;
};

type AppsScriptRuntime = {
    script?: {
        history?: {
            push: (state: object, params: Record<string, string>, hash: string) => void;
            replace: (state: object, params: Record<string, string>, hash: string) => void;
            setChangeHandler: (
                handler: (event: { state?: object; location: AppsScriptLocation }) => void,
            ) => void;
        };
        url?: {
            getLocation: (callback: (location: AppsScriptLocation) => void) => void;
        };
    };
};

function appsScriptRuntime(): AppsScriptRuntime | null {
    const runtime = (globalThis as { google?: AppsScriptRuntime }).google;
    return runtime?.script?.history || runtime?.script?.url ? runtime : null;
}

function applyExternalLocation(location: AppsScriptLocation): void {
    const url = new URL(window.location.href);
    url.search = '';
    Object.entries(location.parameters || {}).forEach(([key, values]) => {
        values.forEach((value) => url.searchParams.append(key, value));
    });
    if (!location.parameters && location.parameter) {
        Object.entries(location.parameter).forEach(([key, value]) =>
            url.searchParams.set(key, value),
        );
    }
    url.hash = location.hash || '';
    window.history.replaceState({ setu: true, ...(location as object) }, '', url.toString());
    setState({ section: url.searchParams.get(APP_SECTION_QUERY_PARAM) || 'home' });
    window.dispatchEvent(new Event('setu:navigation'));
    void renderCurrentSection();
}

/** Sync the iframe's initial state from the outer Apps Script web-app URL. */
export function initializeBrowserLocation(): Promise<void> {
    const runtime = appsScriptRuntime();
    if (!runtime?.script?.url?.getLocation) return Promise.resolve();

    if (!appsScriptHistoryReady && runtime.script.history) {
        runtime.script.history.setChangeHandler((event) => applyExternalLocation(event.location));
        appsScriptHistoryReady = true;
    }

    return new Promise((resolve) => {
        runtime.script!.url!.getLocation((location) => {
            applyExternalLocation(location);
            resolve();
        });
    });
}

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

type OptimisticRequestKind = 'inventory' | 'program' | 'ticket';

const OPTIMISTIC_STATUS: Record<string, string> = {
    submit: 'submitted',
    approve: 'approved',
    reject: 'rejected',
    issue: 'issued',
    return: 'returned',
    close: 'closed',
    cancel: 'cancelled',
    reopen: 'pending',
};

/** Apply a reversible dashboard mutation before Apps Script responds.
 *
 * The server remains authoritative: a successful mutation triggers a quiet
 * refresh, while a failed one restores the previous dashboard and rethrows.
 */
export async function runOptimisticDashboardUpdate(
    update: (dashboard: DashboardPayload) => DashboardPayload,
    operation: () => Promise<unknown>,
): Promise<void> {
    const previous = getState().dashboard;
    if (!previous) return operation().then(() => undefined);
    setState({ dashboard: update(previous) });
    await renderCurrentSection();

    try {
        await operation();
    } catch (error) {
        setState({ dashboard: previous });
        await renderCurrentSection();
        void refreshDashboard().catch(() => undefined);
        throw error;
    }

    void refreshDashboard().catch(() => undefined);
}

/**
 * Apply a small, reversible dashboard mutation before Apps Script responds.
 * The server remains authoritative: a successful mutation triggers a quiet
 * refresh, while a failed one restores the previous dashboard and rethrows so
 * the caller can show its existing error notification.
 */
export async function runOptimisticRequestAction(
    kind: OptimisticRequestKind,
    id: string,
    action: string,
    operation: () => Promise<unknown>,
): Promise<void> {
    const status = OPTIMISTIC_STATUS[action];
    await runOptimisticDashboardUpdate(
        (previous) =>
            Object.assign({}, previous, {
                inventoryRequests:
                    kind === 'inventory'
                        ? previous.inventoryRequests.map((request) =>
                              request.Id === id && status
                                  ? Object.assign({}, request, { Status: status })
                                  : request,
                          )
                        : previous.inventoryRequests,
                programRequests:
                    kind === 'program'
                        ? previous.programRequests.map((request) =>
                              request.Id === id && status
                                  ? Object.assign({}, request, { Status: status })
                                  : request,
                          )
                        : previous.programRequests,
                tickets:
                    kind === 'ticket'
                        ? previous.tickets.map((ticket) =>
                              ticket.Id === id && status
                                  ? Object.assign({}, ticket, { Status: status })
                                  : ticket,
                          )
                        : previous.tickets,
            }),
        operation,
    );
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
    const isInventoryTypes = sectionKey === 'inventory-types';
    const isDepartments = sectionKey === 'departments';
    const isUsers = sectionKey === 'users';
    const isPlaces = sectionKey === 'places';
    const isEdgeToEdge = isWorkbenchBrowse || isWorkbenchDetail;
    container.classList.toggle('app-content-home', isHome);
    container.classList.toggle('app-content-edge', isEdgeToEdge);
    container.classList.toggle('app-content-settings', isSettingsSection && !isInventoryTypes);
    container.classList.toggle('app-content-departments', isDepartments);
    container.classList.toggle('app-content-users', isUsers);
    container.classList.toggle('app-content-places', isPlaces);
    container.classList.toggle('app-content-inventory-types', isInventoryTypes);
    container.classList.toggle('mx-auto', !isHome && !isEdgeToEdge);
    container.classList.toggle('max-w-[50rem]', !isHome && !isEdgeToEdge && !isSettingsSection);
    unmountRefinePage(container);
    await sections[sectionKey](container, dashboard);
    toggleRoleNavVisibility(dashboard);
}

// New sign-ins land with an empty Phone (see Auth.ts) until they fill in
// the registration form, so the nav must stay hidden — otherwise they could
// tap into other sections while their profile (department, etc.) is still
// unset.
function toggleNavVisibility(show: boolean): void {
    document.querySelectorAll<HTMLElement>('[data-authenticated-nav]').forEach((el) => {
        el.style.display = show ? '' : 'none';
    });
}

function renderNavIdentity(dashboard: DashboardPayload): void {
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl) nameEl.textContent = dashboard.me.Name;
    document.documentElement.dataset.userRole = dashboard.me.Role;
    window.dispatchEvent(new Event('setu:role'));
}

// Which sections the signed-in role may open at all. Home, Inventory,
// Programs and Profile are open to everyone; the rest are role-gated, and
// the backend enforces the same thing (requireApprover in Admin.ts and
// Roster.ts, requireAdmin for the config writes, requireTicketAccess in
// Tickets.ts).
function canOpenSection(section: SectionKey, me: UserDTO): boolean {
    if (CONFIG_SECTIONS.indexOf(section) !== -1) return canApprove(me);
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

// Hides the entries for sections this role can't open wherever they appear —
// the desktop bar, mobile dock, and profile menu each render their own copy.
function toggleRoleNavVisibility(dashboard: DashboardPayload): void {
    document.querySelectorAll<HTMLElement>('[data-nav-section]').forEach((el) => {
        const section = el.dataset.navSection as SectionKey;
        const hidden = !canOpenSection(section, dashboard.me);
        el.classList.toggle('hidden', hidden);
        el.hidden = hidden;
        const menuItem = el.closest<HTMLElement>('.ant-menu-item, .ant-dropdown-menu-item');
        if (menuItem) {
            menuItem.hidden = hidden;
            menuItem.style.display = hidden ? 'none' : '';
        }
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

const DETAIL_QUERY_PARAMS = [
    USER_QUERY_PARAM,
    DEPARTMENT_QUERY_PARAM,
    PLACE_QUERY_PARAM,
    INVENTORY_TYPE_QUERY_PARAM,
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
        DETAIL_QUERY_PARAMS.forEach((param) => url.searchParams.delete(param));
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
    const runtime = appsScriptRuntime();
    const historyApi = runtime?.script?.history;
    if (historyApi) {
        const params = Object.fromEntries(url.searchParams.entries());
        if (options.replace) historyApi.replace(state, params, url.hash.slice(1));
        else historyApi.push(state, params, url.hash.slice(1));
    }
    window.dispatchEvent(new Event('setu:navigation'));
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

export function navigateToRoster(): void {
    navigateTo('roster');
}

export function navigateToUser(userEmail: string): void {
    navigateTo('users', { selectedParam: USER_QUERY_PARAM, selectedId: userEmail });
}

export function navigateToDepartment(departmentId: string): void {
    navigateTo('departments', {
        selectedParam: DEPARTMENT_QUERY_PARAM,
        selectedId: departmentId,
    });
}

export function navigateToPlace(placeId: string): void {
    navigateTo('places', { selectedParam: PLACE_QUERY_PARAM, selectedId: placeId });
}

export function navigateToInventoryType(inventoryTypeId: string): void {
    navigateTo('inventory-types', {
        selectedParam: INVENTORY_TYPE_QUERY_PARAM,
        selectedId: inventoryTypeId,
    });
}

export function navigateBackToSection(section: SectionKey): void {
    navigateTo(section, { replace: true });
}

export function navigateToTicketCreate(): void {
    navigateTo('tickets', { mode: 'create', preserveWorkbench: true });
}

function navigateBackToWorkbench(section: SectionKey): void {
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
        window.dispatchEvent(new Event('setu:navigation'));
        renderCurrentSection();
    });
}
