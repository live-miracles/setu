import { createClient } from 'npm:@supabase/supabase-js@2';
import {
    buildRawEmail,
    type EmailOutboxRow,
    type EmailSettings,
    failureUpdate,
    parseEmailList,
} from './format.ts';

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
            timeZone: env('EMAIL_TIME_ZONE') || 'Asia/Kolkata',
            senderEmail: env('GMAIL_SENDER'),
            senderName: env('EMAIL_SENDER_NAME') || 'Live Stream Setu',
            replyTo: env('EMAIL_REPLY_TO'),
            ccEmails: parseEmailList(env('CC_EMAIL')),
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

async function sendGmail(accessToken: string, raw: string): Promise<string> {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
    });
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`Gmail send failed with HTTP ${response.status}: ${detail}`);
    }
    const body = await response.json();
    return String(body.id || '');
}

async function updateRow(id: string, values: Record<string, string>): Promise<void> {
    const { error } = await supabase.from('email_outbox').update(values).eq('id', id);
    if (error) console.error(`Could not update email row ${id}: ${error.message}`);
}

Deno.serve(async (request) => {
    const config = readConfig();
    if (!config) return Response.json({ processed: 0, configured: false });
    if (request.headers.get('x-dispatch-secret') !== config.dispatchSecret) {
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

    const { data, error } = await supabase.rpc('claim_comment_email_batch', {
        batch_size: DISPATCH_BATCH_SIZE,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const rows = (data || []) as EmailOutboxRow[];

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
        let messageId: string;
        try {
            messageId = await sendGmail(accessToken, buildRawEmail(row, config.settings));
        } catch (sendError) {
            failed++;
            await updateRow(row.id, failureUpdate(row.attempts, sendError));
            continue;
        }
        // The email is out; a failed status update must not queue a resend.
        await updateRow(row.id, {
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: `gmail:${messageId}`,
        });
        sent++;
    }
    return Response.json({ processed: rows.length, sent, failed });
});
