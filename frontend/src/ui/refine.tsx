import { Refine, type NotificationProvider } from '@refinedev/core';
import { App as AntApp, ConfigProvider, type ThemeConfig } from 'antd';
import { useEffect, useMemo, type ReactNode } from 'react';
import { queryClient } from '../query-client';
import { REFINE_RESOURCE_NAMES, setuDataProvider } from './refine-data-provider';
import { setErrorNotifier } from './feedback';
import { useIsMobileViewport } from './viewport';

// Refine is intentionally headless here. The app keeps its existing transport
// and visual tokens while Refine owns the resource boundary for the React
// surfaces; React Router owns the URL (see app.tsx).

// Notion-inspired tokens (see awesome-design-md/design-md/notion). antd
// computes its whole derived palette from these seed tokens via color math,
// so they must be real colors, not CSS var() references — keep these in sync
// with the --setu-* custom properties in input.css.
export const SETU_ANTD_THEME: ThemeConfig = {
    token: {
        colorPrimary: '#5645d4',
        colorInfo: '#0075de',
        colorLink: '#0075de',
        colorSuccess: '#1aae39',
        colorWarning: '#dd5b00',
        colorError: '#e03131',
        colorErrorHover: '#c92a2a',
        colorErrorActive: '#a61e1e',
        colorErrorBg: '#fdecec',
        colorErrorBgHover: '#fbdede',
        colorErrorBorder: '#f2b3b3',
        colorErrorBorderHover: '#e88a8a',
        colorErrorText: '#c92a2a',
        colorErrorTextHover: '#a61e1e',
        colorBgBase: '#ffffff',
        colorBgLayout: '#f6f5f4',
        colorTextBase: '#1a1a1a',
        colorBorder: '#c8c4be',
        colorBorderSecondary: '#e5e3df',
        borderRadius: 8,
        borderRadiusLG: 12,
        fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    },
    components: {
        // Notion buttons are flat; antd's default drop shadows are dropped.
        Button: { primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
        Table: { headerBg: '#f6f5f4' },
    },
};

// Refine's hooks report mutation success/failure through this provider. It
// maps them onto antd notifications so the app does not need @refinedev/antd.
function useAntNotificationProvider(): NotificationProvider {
    const { notification } = AntApp.useApp();
    return useMemo(
        () => ({
            open: ({ key, message, description, type }) =>
                notification.open({
                    key,
                    message,
                    description,
                    type: type === 'progress' ? 'info' : type,
                }),
            close: (key) => notification.destroy(key),
        }),
        [notification],
    );
}

// Mounted once at the app root (see app.tsx) — replaces the old per-navigation
// mountRefinePage()/unmountRefinePage() bridge, along with the single-resource
// `resources` array it registered on every page. Every resource
// refine-data-provider.ts knows about is registered up front instead.
export function AppProviders({ children }: { children: ReactNode }) {
    // Large controls (40px, 16px text) are antd's touch-friendly size.
    const isMobile = useIsMobileViewport();
    return (
        <ConfigProvider theme={SETU_ANTD_THEME} componentSize={isMobile ? 'large' : undefined}>
            <AntApp>
                <RefineProvider>{children}</RefineProvider>
            </AntApp>
        </ConfigProvider>
    );
}

function RefineProvider({ children }: { children: ReactNode }) {
    const notificationProvider = useAntNotificationProvider();
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
