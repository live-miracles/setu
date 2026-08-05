const SIDEBAR_COLLAPSED_STORAGE_KEY = 'setu.sidebar.collapsed';

function readCollapsed(): boolean {
    try {
        return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch (_err) {
        return false;
    }
}

function storeCollapsed(collapsed: boolean): void {
    try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch (_err) {
        // The current session still updates when storage is unavailable.
    }
}

function applyCollapsed(collapsed: boolean): void {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const toggle = document.getElementById('sidebar-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
    toggle.setAttribute('title', collapsed ? 'Expand navigation' : 'Collapse navigation');
}

function setMobileDrawer(open: boolean): void {
    document.body.classList.toggle('mobile-nav-open', open);
    const drawer = document.getElementById('mobile-dock');
    const trigger = document.getElementById('mobile-menu-toggle');
    drawer?.setAttribute('aria-hidden', String(!open));
    trigger?.setAttribute('aria-expanded', String(open));
    if (open) {
        (document.getElementById('mobile-menu-close') as HTMLButtonElement | null)?.focus();
    } else if (document.activeElement?.closest('#mobile-dock')) {
        (trigger as HTMLButtonElement | null)?.focus();
    }
}

export function closeMobileNavigation(): void {
    setMobileDrawer(false);
}

export function wireSidebar(): void {
    applyCollapsed(readCollapsed());

    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
        const collapsed = !document.body.classList.contains('sidebar-collapsed');
        applyCollapsed(collapsed);
        storeCollapsed(collapsed);
    });

    document.getElementById('mobile-menu-toggle')?.addEventListener('click', () => {
        setMobileDrawer(true);
    });
    document.getElementById('mobile-menu-close')?.addEventListener('click', closeMobileNavigation);
    document
        .getElementById('mobile-nav-backdrop')
        ?.addEventListener('click', closeMobileNavigation);
    document.getElementById('mobile-dock')?.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('[data-nav-section]')) closeMobileNavigation();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('mobile-nav-open')) {
            closeMobileNavigation();
        }
    });
}
