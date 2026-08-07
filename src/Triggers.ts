// Replaces both of the source app's cron jobs. The 15-minute retry sweep is
// gone entirely (see Notifications.ts's FailedNotifications design); only
// the daily overdue scan remains, as a native Apps Script time-driven trigger.
function dailyOverdueScan(): { scanned: number } {
    const todayIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const overdue = Tables.InventoryRequests.findWhere(
        (r) => r.Status === 'issued' && r.EndDate < todayIso,
    );
    return { scanned: overdue.length };
}

// Run once manually from the Apps Script editor after the first deploy.
// `clasp push` never installs triggers; this is idempotent so it is safe to
// re-run after future pushes without duplicating the trigger.
function installTriggers(): void {
    const existing = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
    if (existing.indexOf('dailyOverdueScan') === -1) {
        ScriptApp.newTrigger('dailyOverdueScan').timeBased().everyDays(1).atHour(3).create();
    }
}
