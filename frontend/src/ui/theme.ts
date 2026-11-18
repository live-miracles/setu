import { useSyncExternalStore } from 'react';

// Light / dark theme. The choice lives in localStorage and as `data-theme` on
// <html>, which input.css maps to a block of colour tokens. Dark is the default
// until someone picks light. The inline script in shell.html applies the saved
// choice before first paint (so there is no flash); this module changes it
// afterwards and keeps other open tabs in step.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'setu-theme';
export const DEFAULT_THEME: Theme = 'dark';

// The browser chrome (Android status bar, installed-app title bar) follows
// <meta name="theme-color">; keep these in step with --setu-paper and the
// brand colour in shell.html.
const THEME_COLORS: Record<Theme, string> = { light: '#e8590c', dark: '#121110' };

export function parseTheme(value: string | null | undefined): Theme {
    return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
}

function readStoredTheme(): Theme {
    try {
        return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
        // Storage can be blocked (private windows, site data off).
        return DEFAULT_THEME;
    }
}

const listeners = new Set<() => void>();
let current: Theme = readStoredTheme();

function apply(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLORS[theme]);
}

function setCurrent(theme: Theme): void {
    if (theme === current) return;
    current = theme;
    apply(theme);
    listeners.forEach((listener) => listener());
}

export function getTheme(): Theme {
    return current;
}

export function setTheme(theme: Theme): void {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // The choice still applies for this visit.
    }
    setCurrent(theme);
}

export function toggleTheme(): void {
    setTheme(current === 'dark' ? 'light' : 'dark');
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// Another tab changed the choice.
window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY) setCurrent(parseTheme(event.newValue));
});

// Makes sure the document matches (the inline script normally already did).
apply(current);

export function useTheme(): Theme {
    return useSyncExternalStore(subscribe, getTheme, getTheme);
}
