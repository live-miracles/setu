import { APP_SECTION_QUERY_PARAM } from './config';
import { initRouter, refreshDashboard, wireNav } from './router';
import { wireSidebar } from './sidebar';
import { ROUTER_CONFIG } from './sections';
import { setState } from './state';
import { escapeHtml } from './ui/format';
import { showErrorAlert } from './ui/feedback';
import { renderPageSkeleton } from './ui/components';

// Production entry point — the module esbuild bundles into src/JavaScript.html.
// Deliberately tiny: it hands the routing table to the router and starts the
// app. Nothing it imports reaches mock/backend.ts, which is why the mock can
// never ship (see dev.ts for the entry point that does pull it in).

async function boot(): Promise<void> {
    initRouter(ROUTER_CONFIG);

    // An unknown or role-forbidden key is normalised by the router when it
    // renders, so the raw query value can go straight into state.
    const params = new URLSearchParams(window.location.search);
    setState({ section: params.get(APP_SECTION_QUERY_PARAM) || 'home' });

    wireNav();
    wireSidebar();

    await loadDashboard();
}

async function loadDashboard(): Promise<void> {
    const container = document.getElementById('app-content');
    if (container) container.innerHTML = renderPageSkeleton();
    try {
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
        if (container) {
            container.innerHTML = `<section class="setu-load-error" role="alert"><div class="ops-kicker">Connection problem</div><h1 class="mt-2 font-serif text-4xl">We couldn’t load the workspace.</h1><p class="mt-3 max-w-xl text-sm text-base-content/65">${escapeHtml(err instanceof Error ? err.message : String(err))}</p><button type="button" id="retry-dashboard" class="btn btn-primary mt-6">Try again</button></section>`;
            const retry = document.getElementById('retry-dashboard') as HTMLButtonElement | null;
            retry?.addEventListener('click', () => void loadDashboard());
            retry?.focus();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    boot();
});
