import { message, notification } from 'antd';

// The two pieces of chrome that live in the page shell rather than in any
// one section, so every section reports progress and failure the same way.
type ErrorNotifier = (config: { message: string; description: string }) => void;
let errorNotifier: ErrorNotifier | null = null;

export function setErrorNotifier(notifier: ErrorNotifier | null): void {
    errorNotifier = notifier;
}

export function showSavingBadge(saving: boolean): void {
    if (saving)
        message.open({ key: 'setu-saving', type: 'loading', content: 'Saving…', duration: 0 });
    else message.destroy('setu-saving');
}

export function showErrorAlert(error: unknown): void {
    const message =
        error instanceof Error
            ? error.message
            : String((error as any)?.message || error || 'Something went wrong.');
    const config = { message: 'Something went wrong', description: message };
    if (errorNotifier) errorNotifier(config);
    else notification.error(config);
}
