const DISPATCH_BATCH_SIZE = 100;

type EmailOutboxRow = {
    id: string;
    recipient: string;
    payload: {
        cc?: string[];
        message?: string;
        targetName?: string;
        authorName?: string;
        requestPath?: string;
        automatedReminder?: boolean;
        sessions?: Array<{ name?: string; type?: string; startAt?: string; endAt?: string }>;
        items?: Array<{ name?: string; quantity?: number }>;
    };
    attempts: number;
};

/**
 * Claims and sends queued comment notifications. The trigger runs as the
 * Workspace account that owns the Apps Script project, so MailApp uses that
 * account's authorized sender identity.
 *
 * Run installEmailDispatcherTrigger once manually after the first deployment.
 */
function runCommentEmailDispatcher(): { processed: number; sent: number; failed: number } {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return { processed: 0, sent: 0, failed: 0 };

    try {
        const properties = PropertiesService.getScriptProperties();
        const supabaseUrl = requiredProperty(properties, 'SUPABASE_URL');
        const serviceRoleKey = requiredProperty(properties, 'SUPABASE_SERVICE_ROLE_KEY');
        const senderName = properties.getProperty('EMAIL_SENDER_NAME') || 'Live Stream Setu';
        const remainingQuota = MailApp.getRemainingDailyQuota();
        if (remainingQuota <= 0) return { processed: 0, sent: 0, failed: 0 };

        const rows = claimRows(
            supabaseUrl,
            serviceRoleKey,
            Math.min(DISPATCH_BATCH_SIZE, remainingQuota),
        );
        let sent = 0;
        let failed = 0;

        for (const row of rows) {
            try {
                const targetName = row.payload?.targetName || 'Setu request';
                const message = row.payload?.message || '';
                const subject = row.payload?.automatedReminder
                    ? `Reminder: equipment due back for ${targetName}`
                    : `New comment on ${targetName}`;
                const body = formatEmailBody(message, row.payload, properties);
                const cc = (row.payload?.cc || []).filter(
                    (email) => email.trim().toLowerCase() !== row.recipient.trim().toLowerCase(),
                );

                MailApp.sendEmail({
                    to: row.recipient,
                    ...(cc.length ? { cc: cc.join(',') } : {}),
                    subject,
                    body,
                    name: senderName,
                    noReply: true,
                });
                updateRow(supabaseUrl, serviceRoleKey, row.id, {
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    provider_message_id: `apps-script:${new Date().getTime()}:${row.id}`,
                });
                sent++;
            } catch (error) {
                failed++;
                updateRow(supabaseUrl, serviceRoleKey, row.id, {
                    status: 'failed',
                    last_error: String(error),
                });
            }
        }

        return { processed: rows.length, sent, failed };
    } finally {
        lock.releaseLock();
    }
}

function formatEmailBody(
    message: string,
    payload: EmailOutboxRow['payload'],
    properties: GoogleAppsScript.Properties.Properties,
): string {
    const author = payload.authorName || 'Setu Bot';
    const sections: string[] = [`${author} commented:\n\n${message}`];
    if (payload.sessions?.length) {
        sections.push(
            'Sessions:\n' +
                payload.sessions
                    .map(
                        (session) =>
                            `- ${session.name || session.type || 'Session'}: ${session.startAt || ''} – ${session.endAt || ''}`,
                    )
                    .join('\n'),
        );
    }
    if (payload.items?.length) {
        sections.push(
            'Inventory items:\n' +
                payload.items
                    .map((item) => `- ${item.quantity || 0} × ${item.name || 'Unnamed item'}`)
                    .join('\n'),
        );
    }
    const appUrl = (properties.getProperty('APP_URL') || '').trim().replace(/\/$/, '');
    const requestUrl = payload.requestPath
        ? appUrl
            ? `${appUrl}${payload.requestPath}`
            : payload.requestPath
        : '';
    sections.push(
        requestUrl ? `View request: ${requestUrl}` : 'Open Setu to view the conversation.',
    );
    return sections.join('\n\n');
}

/** Install or repair the ten-minute trigger. Safe to run repeatedly. */
function installEmailDispatcherTrigger(): void {
    ScriptApp.getProjectTriggers()
        .filter((trigger) => trigger.getHandlerFunction() === 'runCommentEmailDispatcher')
        .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
    ScriptApp.newTrigger('runCommentEmailDispatcher').timeBased().everyMinutes(10).create();
}

function claimRows(
    supabaseUrl: string,
    serviceRoleKey: string,
    batchSize: number,
): EmailOutboxRow[] {
    const response = UrlFetchApp.fetch(`${supabaseUrl}/rest/v1/rpc/claim_comment_email_batch`, {
        method: 'post',
        contentType: 'application/json',
        headers: authHeaders(serviceRoleKey),
        payload: JSON.stringify({ batch_size: batchSize }),
        muteHttpExceptions: true,
    });
    assertSuccessful(response, 'claim email batch');
    return JSON.parse(response.getContentText()) as EmailOutboxRow[];
}

function updateRow(
    supabaseUrl: string,
    serviceRoleKey: string,
    id: string,
    values: Record<string, string>,
): void {
    const response = UrlFetchApp.fetch(
        `${supabaseUrl}/rest/v1/email_outbox?id=eq.${encodeURIComponent(id)}`,
        {
            method: 'patch',
            contentType: 'application/json',
            headers: { ...authHeaders(serviceRoleKey), Prefer: 'return=minimal' },
            payload: JSON.stringify(values),
            muteHttpExceptions: true,
        },
    );
    assertSuccessful(response, `update email row ${id}`);
}

function authHeaders(serviceRoleKey: string): Record<string, string> {
    return {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
    };
}

function requiredProperty(
    properties: GoogleAppsScript.Properties.Properties,
    name: string,
): string {
    const value = properties.getProperty(name)?.trim();
    if (!value) throw new Error(`Missing Apps Script property: ${name}`);
    return value;
}

function assertSuccessful(
    response: GoogleAppsScript.URL_Fetch.HTTPResponse,
    operation: string,
): void {
    const status = response.getResponseCode();
    if (status < 200 || status >= 300) {
        throw new Error(`${operation} failed with HTTP ${status}: ${response.getContentText()}`);
    }
}
