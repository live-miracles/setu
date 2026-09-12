import { Refine } from '@refinedev/core';
import { useNotificationProvider } from '@refinedev/antd';
import { App as AntApp, ConfigProvider, type ThemeConfig } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { queryClient } from '../query-client';
import { REFINE_RESOURCE_NAMES, setuDataProvider } from './refine-data-provider';
import { setErrorNotifier } from './feedback';

// Refine is intentionally headless here. The app keeps its existing transport
// and visual tokens while Refine owns the resource boundary for the React
// surfaces; React Router owns the URL (see app.tsx).

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

// Mounted once at the app root (see app.tsx) — replaces the old per-navigation
// mountRefinePage()/unmountRefinePage() bridge, along with the single-resource
// `resources` array it registered on every page. Every resource
// refine-data-provider.ts knows about is registered up front instead.
export function AppProviders({ children }: { children: ReactNode }) {
    return (
        <ConfigProvider theme={SETU_ANTD_THEME}>
            <AntApp>
                <RefineProvider>{children}</RefineProvider>
            </AntApp>
        </ConfigProvider>
    );
}

function RefineProvider({ children }: { children: ReactNode }) {
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
            resources={REFINE_RESOURCE_NAMES.map((name) => ({ name, list: `/${name}` }))}
            options={{ syncWithLocation: false, reactQuery: { clientConfig: queryClient } }}>
            {children}
        </Refine>
    );
}
