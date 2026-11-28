import { createClient } from 'npm:@supabase/supabase-js@2';
import {
    buildRawEmail,
    type EmailOutboxRow,
    type EmailSettings,
    failureUpdate,
    inventoryItemLabel,
    type RequestDetails,
    threadingFor,
    withRequestDetails,
} from './format.ts';
import { secretsMatch } from './secret.ts';

// pg_cron calls this every ten minutes (see run_comment_email_dispatch). The
// batch stays small so one run finishes well inside the Edge Function wall
// clock limit and the scheduler's HTTP timeout.
const DISPATCH_BATCH_SIZE = 50;

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
);

type GmailConfig = {
    dispatchSecret: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    settings: EmailSettings;
};

function env(name: string): string {
    return (Deno.env.get(name) || '').trim();
}

function readConfig(): GmailConfig | null {
    const config = {
        dispatchSecret: env('EMAIL_DISPATCH_SECRET'),
        clientId: env('GOOGLE_CLIENT_ID'),
        clientSecret: env('GOOGLE_CLIENT_SECRET'),
        refreshToken: env('GOOGLE_REFRESH_TOKEN'),
        settings: {
            appUrl: env('SETU_APP_ORIGIN'),
            // Photos are linked from the public image bucket, never attached.
            imageBaseUrl: `${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/public/request-images/`,
            timeZone: env('EMAIL_TIME_ZONE') || 'Asia/Kolkata',
            senderEmail: env('GMAIL_SENDER'),
            senderName: env('EMAIL_SENDER_NAME') || 'Live Stream Setu',
            replyTo: env('EMAIL_REPLY_TO'),
            // Filled from the email_cc_addresses table on every run.
            ccEmails: [] as string[],
        },
    };
    const complete =
        config.dispatchSecret &&
        config.clientId &&
        config.clientSecret &&
        config.refreshToken &&
        config.settings.senderEmail;
    return complete ? config : null;
}

/** Exchanges the stored refresh token for a short-lived Gmail access token. */
async function fetchAccessToken(config: GmailConfig): Promise<string> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: config.refreshToken,
            grant_type: 'refresh_token',
        }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
        throw new Error(
            `Google token refresh failed with HTTP ${response.status}: ${body.error || 'no access token'}`,
        );
    }
    return body.access_token as string;
}

async function sendGmail(
    accessToken: string,
    raw: string,
    threadId?: string,
): Promise<{ id: string; threadId: string }> {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`Gmail send failed with HTTP ${response.status}: ${detail}`);
    }
    const body = await response.json();
    return { id: String(body.id || ''), threadId: String(body.threadId || '') };
}

/**
 * The Gmail thread of the first email already sent for this request, so later
 * emails join it. A lookup failure only means this email may start its own
 * thread; it must never block delivery.
 */
async function findThreadId(row: EmailOutboxRow): Promise<string> {
    const targetId = row.payload?.targetId;
    if (!targetId) return '';
    const { data, error } = await supabase
        .from('email_outbox')
        .select('provider_thread_id')
        .in('template', ['comment', 'overdue_reminder'])
        .eq('status', 'sent')
        .eq('payload->>targetId', targetId)
        .not('provider_thread_id', 'is', null)
        .order('sent_at', { ascending: true })
        .limit(1);
    if (error) console.error(`Could not look up the email thread: ${error.message}`);
    return data?.[0]?.provider_thread_id || '';
}

/**
 * What the email header and item list need beyond the stored payload: an
 * inventory request's borrowing dates and its items' photos. Looked up when the
 * email is sent, so it shows the current photo. A failed lookup only means a
 * plainer email; it must never block delivery.
 */
async function findRequestDetails(row: EmailOutboxRow): Promise<RequestDetails | undefined> {
    const targetId = row.payload?.targetId;
    if (!targetId || row.payload?.targetType !== 'inventory_request') return undefined;
    const { data, error } = await supabase
        .from('inventory_requests')
        .select(
            'start_date, end_date, inventory_request_items(inventory_types(brand, name, model, image_path))',
        )
        .eq('id', targetId)
        .maybeSingle();
    if (error || !data) {
        if (error) console.error(`Could not look up request details: ${error.message}`);
        return undefined;
    }
    const photos: RequestDetails['photos'] = [];
    for (const item of data.inventory_request_items || []) {
        const type = item.inventory_types;
        if (type?.image_path) {
            photos.push({ label: inventoryItemLabel(type), imageId: type.image_path });
        }
    }
    return { startDate: data.start_date, endDate: data.end_date, photos };
}

/**
 * The addresses copied on every email, managed by admins in Other settings.
 * A failed read is logged and the emails go out without the copies: reaching
 * the requester matters more than the extra recipients.
 */
async function loadCcEmails(): Promise<string[]> {
    const { data, error } = await supabase
        .from('email_cc_addresses')
        .select('email')
        .order('email');
    if (error) {
        console.error(`Could not read the CC list: ${error.message}`);
        return [];
    }
    return (data || []).map((row) => String(row.email));
}

async function updateRow(id: string, values: Record<string, string>): Promise<void> {
    const { error } = await supabase.from('email_outbox').update(values).eq('id', id);
    if (error) console.error(`Could not update email row ${id}: ${error.message}`);
}

Deno.serve(async (request) => {
    const config = readConfig();
    if (!config) return Response.json({ processed: 0, configured: false });
    if (!(await secretsMatch(request.headers.get('x-dispatch-secret'), config.dispatchSecret))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Refresh the token before claiming rows, so a revoked or expired grant
    // leaves the queue untouched instead of using up every row's attempts.
    let accessToken: string;
    try {
        accessToken = await fetchAccessToken(config);
    } catch (error) {
        console.error(String(error));
        return Response.json({ error: 'Gmail authorization failed' }, { status: 502 });
    }

    const settings = { ...config.settings, ccEmails: await loadCcEmails() };

    const { data, error } = await supabase.rpc('claim_comment_email_batch', {
        batch_size: DISPATCH_BATCH_SIZE,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const rows = (data || []) as EmailOutboxRow[];

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
        let sentMessage: { id: string; threadId: string };
        try {
            const threadId = await findThreadId(row);
            const details = await findRequestDetails(row).catch((lookupError) => {
                console.error(`Could not look up request details: ${String(lookupError)}`);
                return undefined;
            });
            const outgoing =
                details && row.payload
                    ? { ...row, payload: withRequestDetails(row.payload, details) }
                    : row;
            const threading = threadingFor(row, settings.senderEmail);
            sentMessage = await sendGmail(
                accessToken,
                buildRawEmail(outgoing, settings, undefined, threading),
                threadId || undefined,
            );
        } catch (sendError) {
            failed++;
            await updateRow(row.id, failureUpdate(row.attempts, sendError));
            continue;
        }
        // The email is out; a failed status update must not queue a resend.
        await updateRow(row.id, {
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: `gmail:${sentMessage.id}`,
            provider_thread_id: sentMessage.threadId,
        });
        sent++;
    }
    return Response.json({ processed: rows.length, sent, failed });
});
