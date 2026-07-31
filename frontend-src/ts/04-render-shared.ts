// Mandatory anywhere untrusted strings (ticket titles/descriptions/comments,
// purposes, admin notes, names) get interpolated into innerHTML-built
// templates — fixes a known XSS gap in the multi-lang-qa reference pattern
// rather than reproducing it.
function escapeHtml(value: unknown): string {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function generateRequestId(): string {
    const cryptoObj = (window as any).crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    return 'req-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function formatDateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function showSavingBadge(saving: boolean): void {
    const badge = document.getElementById('saving-badge');
    if (badge) badge.classList.toggle('hidden', !saving);
}

function showErrorAlert(error: unknown): void {
    const message =
        error instanceof Error
            ? error.message
            : String((error as any)?.message || error || 'Something went wrong.');
    const container = document.getElementById('error-toast');
    if (!container) {
        window.alert(message);
        return;
    }
    container.textContent = message;
    container.classList.remove('hidden');
    window.setTimeout(() => container.classList.add('hidden'), 5000);
}
