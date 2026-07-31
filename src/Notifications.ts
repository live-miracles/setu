const NOTIFICATION_SEEN_CACHE_TTL_SECONDS = 21600; // 6h de-dup window against retried calls

// Replaces the source app's `notification_deliveries` retry queue: MailApp
// runs synchronously in a try/catch; on failure one row goes into
// FailedNotifications and execution continues rather than queuing a retry.
function sendNotificationEmail(
    recipientId: string,
    eventKey: string,
    title: string,
    message: string,
    href: string,
): void {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'notifseen:' + recipientId + ':' + eventKey;
    if (cache.get(cacheKey)) return;
    cache.put(cacheKey, '1', NOTIFICATION_SEEN_CACHE_TTL_SECONDS);

    const profile = Tables.Profiles.findById(recipientId);
    if (!profile || profile.Status !== 'active' || !toBool(profile.NotificationEmail)) return;

    const appUrl = ScriptApp.getService().getUrl();
    try {
        MailApp.sendEmail({
            to: profile.Email,
            subject: title,
            htmlBody:
                '<h2>' +
                escapeHtml(title) +
                '</h2><p>' +
                escapeHtml(message) +
                '</p><p><a href="' +
                appUrl +
                href +
                '">Open Livestream Operations</a></p>',
        });
    } catch (err: any) {
        Tables.FailedNotifications.insert({
            Timestamp: nowIso(),
            RecipientId: recipientId,
            Channel: 'email',
            Title: title,
            Message: message,
            Error: String((err && err.message) || err),
        });
    }
}
