// A create of a request or a comment carries a client-generated id. The backend
// uses it as the new row's id, so a duplicate delivery of that same call finds
// the row already saved and returns it instead of creating a second one.
export function generateRequestId(): string {
    const cryptoObj = (window as any).crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    return 'req-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
