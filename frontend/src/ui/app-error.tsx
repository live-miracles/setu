import { App as AntApp, ConfigProvider, Result } from 'antd';
import { createRoot } from 'react-dom/client';
import { SETU_ANTD_THEME } from './refine';

export function renderAppError(container: HTMLElement, message: string): void {
    createRoot(container).render(
        <ConfigProvider theme={SETU_ANTD_THEME}>
            <AntApp>
                <Result status="error" title="Something went wrong" subTitle={message} />
            </AntApp>
        </ConfigProvider>,
    );
}
