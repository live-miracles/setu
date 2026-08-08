import { Refine } from '@refinedev/core';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { appsScriptDataProvider } from './refine-data-provider';

// Refine is intentionally headless here. Apps Script serves one inlined HTML
// document, so the app keeps its existing transport and visual tokens while
// Refine owns the resource boundary for the new React surfaces.
const roots = new WeakMap<HTMLElement, { host: HTMLElement; root: Root }>();

export function mountRefinePage(container: HTMLElement, page: ReactNode, resource: string): void {
    let mounted = roots.get(container);
    if (!mounted) {
        const host = document.createElement('div');
        host.className = 'refine-page';
        container.replaceChildren(host);
        mounted = { host, root: createRoot(host) };
        roots.set(container, mounted);
    }

    mounted.root.render(
        <Refine
            dataProvider={appsScriptDataProvider}
            resources={[{ name: resource, list: `/${resource}` }]}
            options={{ syncWithLocation: false }}>
            {page}
        </Refine>,
    );
}

export function unmountRefinePage(container: HTMLElement): void {
    const mounted = roots.get(container);
    if (!mounted) return;
    mounted.root.unmount();
    roots.delete(container);
}
