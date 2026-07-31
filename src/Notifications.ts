const NOTIFICATION_SEEN_CACHE_TTL_SECONDS = 21600; // 6h, perf accelerant only — see below

// Dedup on (RecipientId, EventKey) combines two layers: the sheet scan under
// `withLock` is authoritative and correct at this data scale; CacheService
// sits in front purely to skip the scan on repeats, never trusted alone.
function enqueueNotification(
    recipientId: string,
    eventKey: string,
    title: string,
    message: string,
    href: string,
): Notification | undefined {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'notifseen:' + recipientId + ':' + eventKey;
    if (cache.get(cacheKey)) return undefined;

    return withLock(() => {
        const existing = Tables.Notifications.findWhere(
            (n) => n.RecipientId === recipientId && n.EventKey === eventKey,
        )[0];
        if (existing) {
            cache.put(cacheKey, '1', NOTIFICATION_SEEN_CACHE_TTL_SECONDS);
            return existing;
        }
        const record = Tables.Notifications.insert({
            RecipientId: recipientId,
            EventKey: eventKey,
            Title: title,
            Message: message,
            Href: href || '/',
            ReadAt: '',
            CreatedAt: nowIso(),
        });
        cache.put(cacheKey, '1', NOTIFICATION_SEEN_CACHE_TTL_SECONDS);
        sendEmailIfEnabled(recipientId, title, message, href);
        return record;
    });
}

// Replaces the source app's `notification_deliveries` retry queue: MailApp
// runs synchronously in a try/catch; on failure one row goes into
// FailedNotifications and execution continues rather than queuing a retry.
function sendEmailIfEnabled(
    recipientId: string,
    title: string,
    message: string,
    href: string,
): void {
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

function listMyNotifications(): Notification[] {
    const actor = requireUser();
    return Tables.Notifications.findWhere((n) => n.RecipientId === actor.Id)
        .sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt))
        .slice(0, 100);
}

function markNotificationRead(id: string): Notification {
    const actor = requireUser();
    const n = Tables.Notifications.findById(id);
    if (!n || n.RecipientId !== actor.Id) throw new ValidationError('not_found');
    return withLock(() => Tables.Notifications.updateById(id, { ReadAt: nowIso() }));
}
