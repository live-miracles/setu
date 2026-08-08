import { APP_SECTION_QUERY_PARAM } from './config';
import { initRouter, refreshDashboard, wireNav } from './router';
import { ROUTER_CONFIG } from './sections';
import { setState } from './state';
import { showErrorAlert } from './ui/feedback';
import { mountAppShell } from './ui/shell';

// Production entry point — the module esbuild bundles into src/JavaScript.html.
// Deliberately tiny: it hands the routing table to the router and starts the
// app. Nothing it imports reaches mock/backend.ts, which is why the mock can
// never ship (see dev.ts for the entry point that does pull it in).

async function boot(): Promise<void> {
    mountAppShell();
    initRouter(ROUTER_CONFIG);

    // An unknown or role-forbidden key is normalised by the router when it
    // renders, so the raw query value can go straight into state.
    const params = new URLSearchParams(window.location.search);
    setState({ section: params.get(APP_SECTION_QUERY_PARAM) || 'home' });

    wireNav();

    try {
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
        const container = document.getElementById('app-content');
        if (container) {
            container.textContent = err instanceof Error ? err.message : String(err);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    boot();
});
