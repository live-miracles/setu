import { Refine } from '@refinedev/core';
import { useNotificationProvider } from '@refinedev/antd';
import { App as AntApp, ConfigProvider, type ThemeConfig } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { queryClient } from '../query-client';
import { setuDataProvider } from './refine-data-provider';
import { setErrorNotifier } from './feedback';

// Refine is intentionally headless here. The app keeps its existing transport
// and visual tokens while Refine owns the resource boundary for the React
// surfaces.
const roots = new WeakMap<HTMLElement, { host: HTMLElement; root: Root }>();

// antd computes its whole derived palette from these seed tokens via color
// math, so they must be real colors, not CSS var() references — keep these
// in sync with the --setu-* custom properties in input.css.
export const SETU_ANTD_THEME: ThemeConfig = {
    token: {
        colorPrimary: '#c84f12',
        colorInfo: '#c84f12',
        colorError: '#b85c62',
        colorErrorHover: '#a64b53',
        colorErrorActive: '#923d46',
        colorErrorBg: '#f8e8ea',
        colorErrorBgHover: '#f3dce0',
        colorErrorBorder: '#ddaeb2',
        colorErrorBorderHover: '#d0969d',
        colorErrorText: '#9f424a',
        colorErrorTextHover: '#8d3740',
        colorBgBase: '#fffaf0',
        colorTextBase: '#29251f',
        borderRadius: 6,
        fontFamily: "'Avenir Next', Avenir, 'Segoe UI', sans-serif",
    },
};

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
    return (
        <ConfigProvider theme={SETU_ANTD_THEME}>
            <AntApp>
                <RefineRootContent page={page} resource={resource} />
            </AntApp>
        </ConfigProvider>
    );
}

function RefineRootContent({ page, resource }: { page: ReactNode; resource: string }) {
    const notificationProvider = useNotificationProvider();
    const { notification } = AntApp.useApp();
    useEffect(() => {
        setErrorNotifier((config) => notification.error(config));
        return () => setErrorNotifier(null);
    }, [notification]);
    return (
        <Refine
            dataProvider={setuDataProvider}
            notificationProvider={notificationProvider}
            resources={[{ name: resource, list: `/${resource}` }]}
            // Refine always renders its own QueryClientProvider around
            // `children` — passing our instance here (rather than wrapping
            // from outside, which it would just shadow) is what makes it
            // share the one cache with the imperative code in router.ts.
            options={{ syncWithLocation: false, reactQuery: { clientConfig: queryClient } }}>
            {page}
        </Refine>
    );
}

export function unmountRefinePage(container: HTMLElement): void {
    const mounted = roots.get(container);
    if (!mounted) return;
    mounted.root.unmount();
    roots.delete(container);
}
