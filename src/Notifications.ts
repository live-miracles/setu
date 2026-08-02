const NOTIFICATION_SEEN_CACHE_TTL_SECONDS = 21600; // 6h de-dup window against retried calls

// Replaces the source app's `notification_deliveries` retry queue: MailApp
// runs synchronously in a try/catch; on failure one row goes into
// FailedEmails and execution continues rather than queuing a retry. Sends
// straight to the given address with no Users lookup or opt-out gate —
// there is no per-user notification toggle anymore, and a recipient may be
// a Participant with no Setu account at all.
function sendNotificationEmail(
    email: string,
    eventKey: string,
    title: string,
    message: string,
    href: string,
): void {
    if (!email) return;
    const cache = CacheService.getScriptCache();
    const cacheKey = 'notifseen:' + email + ':' + eventKey;
    if (cache.get(cacheKey)) return;
    cache.put(cacheKey, '1', NOTIFICATION_SEEN_CACHE_TTL_SECONDS);

    const appUrl = ScriptApp.getService().getUrl();
    try {
        MailApp.sendEmail({
            to: email,
            subject: title,
            htmlBody:
                '<h2>' +
                escapeHtml(title) +
                '</h2><p>' +
                escapeHtml(message) +
                '</p><p><a href="' +
                appUrl +
                href +
                '">Open Setu</a></p>',
        });
    } catch (err: any) {
        Tables.FailedEmails.insert({
            Timestamp: nowIso(),
            UserId: email,
            Title: title,
            Message: message,
            Error: String((err && err.message) || err),
        });
    }
}
