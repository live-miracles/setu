import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
);
const resendKey = Deno.env.get('RESEND_API_KEY') || '';
const from = Deno.env.get('EMAIL_FROM') || '';
const dispatchSecret = Deno.env.get('EMAIL_DISPATCH_SECRET') || '';

Deno.serve(async (request) => {
    if (!resendKey || !from || !dispatchSecret) {
        return Response.json({ processed: 0, configured: false });
    }
    if (request.headers.get('x-dispatch-secret') !== dispatchSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: rows, error } = await supabase.rpc('claim_comment_email_batch', {
        batch_size: 100,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!rows?.length) return Response.json({ processed: 0 });

    let sent = 0;
    for (const row of rows) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from,
                    to: [row.recipient],
                    subject: `New comment on ${row.payload?.targetName || 'Setu request'}`,
                    text: `${row.payload?.message || ''}\n\nOpen Setu to view the conversation.`,
                }),
            });
            if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
            await supabase
                .from('email_outbox')
                .update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    provider_message_id: (await response.json()).id,
                })
                .eq('id', row.id);
            sent++;
        } catch (error) {
            // Email delivery is deliberately best-effort. Failed rows are terminal
            // and are not retried, as requested by the product owner.
            await supabase
                .from('email_outbox')
                .update({ status: 'failed', attempts: row.attempts + 1, last_error: String(error) })
                .eq('id', row.id);
        }
    }
    return Response.json({ processed: rows.length, sent });
});
