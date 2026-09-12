import '@ant-design/v5-patch-for-react-19';
import { APP_SECTION_QUERY_PARAM } from './config';
import { initializeBrowserLocation, initRouter, refreshDashboard, wireNav } from './router';
import { ROUTER_CONFIG } from './sections';
import { setState } from './state';
import { renderAppError } from './ui/app-error';
import { setAppLoading } from './ui/app-loading';
import { mountAppShell } from './ui/shell';
import { ensureAuthenticated, isSupabaseConfigured } from './supabase';

// Application entry point for both local development and Vercel.

async function boot(): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error(
            'Setu is not configured. This deployment is missing its Supabase environment values.',
        );
    }
    // false means we're mid-redirect to Google; nothing more to do on this page load.
    if (!(await ensureAuthenticated())) return;
    mountAppShell();
    initRouter(ROUTER_CONFIG);

    // An unknown or role-forbidden key is normalised by the router when it
    // renders, so the raw query value can go straight into state.
    await initializeBrowserLocation();
    const params = new URLSearchParams(window.location.search);
    setState({ section: params.get(APP_SECTION_QUERY_PARAM) || 'home' });

    wireNav();

    try {
        await refreshDashboard();
    } catch (err) {
        const container = document.getElementById('app-content');
        if (container) renderAppError(container, err instanceof Error ? err.message : String(err));
    } finally {
        setAppLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
        void navigator.serviceWorker.register('/sw.js');
    }
    void boot().catch((err) => {
        const container = document.getElementById('app-shell');
        if (container) renderAppError(container, err instanceof Error ? err.message : String(err));
    });
});
