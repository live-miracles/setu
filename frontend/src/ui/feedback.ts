import { dismissToast, pushToast } from './overlay-kit';

// The two pieces of chrome that live in the page shell rather than in any
// one section, so every section reports progress and failure the same way.
const SAVING_TOAST_ID = 'setu-saving';

export function showSavingBadge(saving: boolean): void {
    if (saving) pushToast({ id: SAVING_TOAST_ID, kind: 'loading', title: 'Saving…' });
    else dismissToast(SAVING_TOAST_ID);
}

export function showErrorAlert(error: unknown): void {
    const message =
        error instanceof Error
            ? error.message
            : String((error as any)?.message || error || 'Something went wrong.');
    pushToast({ kind: 'error', title: 'Something went wrong', description: message }, 10000);
}
