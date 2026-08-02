// Every create/action call carries a client-generated id, which the backend
// uses to recognise a duplicate delivery of that same call and return the
// original result instead of applying it twice (see withLockedDedupe in
// Dedupe.ts, which requires >= 8 characters).
export function generateRequestId(): string {
    const cryptoObj = (window as any).crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    return 'req-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
