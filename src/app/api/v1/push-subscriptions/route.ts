import { z } from 'zod';
import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { pushSubscriptionSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
    return apiHandler(async () => {
        const user = await requireUser();
        const input = await parseJson(request, pushSubscriptionSchema);
        if (isDemoMode) return jsonCreated({ enabled: true });
        const admin = createSupabaseAdminClient();
        const { error } = await admin.from('push_subscriptions').upsert(
            {
                profile_id: user.id,
                endpoint: input.endpoint,
                p256dh: input.keys.p256dh,
                auth: input.keys.auth,
                user_agent: request.headers.get('user-agent'),
                last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'endpoint' },
        );
        if (error) throw error;
        await admin.from('profiles').update({ notification_push: true }).eq('id', user.id);
        return jsonCreated({ enabled: true });
    });
}

export async function DELETE(request: Request) {
    return apiHandler(async () => {
        const user = await requireUser();
        const endpoint = z.url().parse(new URL(request.url).searchParams.get('endpoint'));
        if (isDemoMode) return jsonOk({ enabled: false });
        const admin = createSupabaseAdminClient();
        const { error } = await admin
            .from('push_subscriptions')
            .delete()
            .eq('profile_id', user.id)
            .eq('endpoint', endpoint);
        if (error) throw error;
        return jsonOk({ enabled: false });
    });
}
