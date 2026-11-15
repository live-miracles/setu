import { createRoot } from 'react-dom/client';
import { Result } from './kit';

export function renderAppError(container: HTMLElement, message: string): void {
    createRoot(container).render(
        <Result status="error" title="Something went wrong" subTitle={message} />,
    );
}
