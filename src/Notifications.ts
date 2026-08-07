const NOTIFICATION_SEEN_CACHE_TTL_SECONDS = 21600; // 6h de-dup window against retried calls

// Replaces the source app's `notification_deliveries` retry queue: email
// sends synchronously in a try/catch; on failure one row goes into
// FailedEmails and execution continues rather than queuing a retry. GmailApp
// is used first so configured aliases can be used as the sender; MailApp is
// the fallback when that alias is unavailable.
function sendNotificationEmail(
    toEmail: string,
    ccEmails: string[],
    eventKey: string,
    title: string,
    message: string,
    href: string,
    fromName = 'Setu',
): void {
    if (!toEmail) return;
    const cache = CacheService.getScriptCache();
    const cacheKey = 'notifseen:' + toEmail + ':' + ccEmails.join(',') + ':' + eventKey;
    if (cache.get(cacheKey)) return;
    cache.put(cacheKey, '1', NOTIFICATION_SEEN_CACHE_TTL_SECONDS);

    const appUrl = ScriptApp.getService().getUrl();
    const htmlBody =
        '<h2>' +
        escapeHtml(title) +
        '</h2><p>' +
        escapeHtml(message) +
        '</p><p><a href="' +
        appUrl +
        href +
        '">Open Setu</a></p>';
    try {
        GmailApp.sendEmail(toEmail, title, message, {
            from: toEmail,
            cc: ccEmails.join(','),
            name: fromName,
            replyTo: toEmail,
            htmlBody,
        });
    } catch (_gmailErr) {
        try {
            MailApp.sendEmail({
                to: toEmail,
                cc: ccEmails.join(','),
                subject: title,
                name: fromName,
                replyTo: toEmail,
                htmlBody,
            });
        } catch (err: any) {
            Tables.FailedEmails.insert({
                Timestamp: nowIso(),
                UserId: toEmail,
                Title: title,
                Message: message,
                Error: String((err && err.message) || err),
            });
        }
    }
}

function notificationFromEmail(): string {
    const setting = Tables.Settings.findById('NotificationEmail');
    return (setting && setting.Value) || 'email@domain.com';
}
