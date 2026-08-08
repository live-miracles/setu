import { message, notification } from 'antd';

// The two pieces of chrome that live in the page shell rather than in any
// one section, so every section reports progress and failure the same way.

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
    notification.error({ message: 'Something went wrong', description: message });
}
