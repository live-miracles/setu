// The two pieces of chrome that live in the page shell rather than in any
// one section, so every section reports progress and failure the same way.

export function showSavingBadge(saving: boolean): void {
    const badge = document.getElementById('saving-badge');
    if (badge) badge.classList.toggle('hidden', !saving);
}

export function showErrorAlert(error: unknown): void {
    const message =
        error instanceof Error
            ? error.message
            : String((error as any)?.message || error || 'Something went wrong.');
    const container = document.getElementById('error-toast');
    if (!container) {
        window.alert(message);
        return;
    }
    const textEl = container.querySelector('[data-error-text]');
    if (textEl) textEl.textContent = message;
    else container.textContent = message;
    container.classList.remove('hidden');
    window.setTimeout(() => container.classList.add('hidden'), 5000);
}

export function showSuccessToast(message: string): void {
    const container = document.getElementById('success-toast');
    if (!container) return;
    const textEl = container.querySelector('[data-success-text]');
    if (textEl) textEl.textContent = message;
    container.classList.remove('hidden');
    window.setTimeout(() => container.classList.add('hidden'), 3500);
}

export function setButtonPending(button: HTMLButtonElement, pending: boolean): void {
    button.disabled = pending;
    button.setAttribute('aria-busy', String(pending));
    button.classList.toggle('is-pending', pending);
}
