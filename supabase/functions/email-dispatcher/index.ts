import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
);
const dispatchSecret = Deno.env.get('EMAIL_DISPATCH_SECRET') || '';

Deno.serve(async (request) => {
    if (!dispatchSecret) {
        return Response.json({ processed: 0, configured: false });
    }
    if (request.headers.get('x-dispatch-secret') !== dispatchSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Delivery has moved to Apps Script. Keep this endpoint harmless if an old
    // deployment receives a request while the Supabase cron job is removed.
    return Response.json({ processed: 0, sent: 0, configured: true });
});
