import type { Metadata, Viewport } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import { DemoStoreProvider } from '@/demo/store';
import './globals.css';

export const metadata: Metadata = {
    title: {
        default: 'Livestream Operations',
        template: '%s · Livestream Operations',
    },
    description: 'Roster, inventory and support operations for the Livestream team.',
    applicationName: 'Livestream Operations',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Livestream Ops',
    },
    icons: {
        icon: '/icons/icon-64.png',
        apple: '/icons/apple-touch-icon.png',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover',
    themeColor: '#17191f',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>
                <AntdRegistry>
                    <ConfigProvider
                        theme={{
                            token: {
                                colorPrimary: '#ff6257',
                                colorInfo: '#ff6257',
                                colorSuccess: '#2aa876',
                                colorWarning: '#e79b36',
                                colorError: '#e04f5f',
                                borderRadius: 12,
                                borderRadiusLG: 18,
                                fontFamily:
                                    'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                            },
                            components: {
                                Button: {
                                    controlHeight: 42,
                                    fontWeight: 650,
                                    primaryShadow: 'none',
                                },
                                Card: {
                                    paddingLG: 20,
                                },
                                Modal: {
                                    borderRadiusLG: 22,
                                },
                            },
                        }}>
                        <DemoStoreProvider>{children}</DemoStoreProvider>
                    </ConfigProvider>
                </AntdRegistry>
            </body>
        </html>
    );
}
