import { Refine } from '@refinedev/core';
import { useNotificationProvider } from '@refinedev/antd';
import { App as AntApp, ConfigProvider } from 'antd';
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

    mounted.root.render(<RefineRoot page={page} resource={resource} />);
}

function RefineRoot({ page, resource }: { page: ReactNode; resource: string }) {
    const notificationProvider = useNotificationProvider();
    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: '#c84f12',
                    colorInfo: '#c84f12',
                    colorBgBase: '#fffaf0',
                    colorTextBase: '#29251f',
                    borderRadius: 6,
                    fontFamily: "'Avenir Next', Avenir, 'Segoe UI', sans-serif",
                },
            }}>
            <AntApp>
                <Refine
                    dataProvider={appsScriptDataProvider}
                    notificationProvider={notificationProvider}
                    resources={[{ name: resource, list: `/${resource}` }]}
                    options={{ syncWithLocation: false }}>
                    {page}
                </Refine>
            </AntApp>
        </ConfigProvider>
    );
}

export function unmountRefinePage(container: HTMLElement): void {
    const mounted = roots.get(container);
    if (!mounted) return;
    mounted.root.unmount();
    roots.delete(container);
}
