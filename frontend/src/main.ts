import '@ant-design/v5-patch-for-react-19';
import { mountApp } from './app';
import { renderAppError } from './ui/app-error';
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
    const container = document.getElementById('app-shell');
    if (!container) throw new Error('Missing #app-shell mount point.');
    mountApp(container);
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
