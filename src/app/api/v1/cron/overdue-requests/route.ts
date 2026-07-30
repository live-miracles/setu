import { formatISO } from 'date-fns';
import { apiHandler, jsonOk } from '@/lib/api';
import { requireCronSecret } from '@/lib/cron';
import { isDemoMode } from '@/lib/env';
import { enqueueNotification } from '@/lib/notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    return apiHandler(async () => {
        requireCronSecret(request);
        if (isDemoMode) return jsonOk({ scanned: 0, notified: 0 });

        const today = formatISO(new Date(), { representation: 'date' });
        const admin = createSupabaseAdminClient();
        const { data: overdue, error } = await admin
            .from('inventory_requests')
            .select('id,display_id,requester_id,to_date')
            .eq('status', 'issued')
            .lt('to_date', today)
            .limit(500);
        if (error) throw error;

        let notified = 0;
        for (const item of overdue ?? []) {
            await enqueueNotification({
                recipientId: item.requester_id,
                eventKey: `inventory:${item.id}:overdue:${today}`,
                title: `REQ-${item.display_id} is overdue`,
                message: `The equipment was due on ${item.to_date}. Please arrange its return.`,
                href: '/app?section=inventory',
            });
            notified += 1;
        }

        return jsonOk({ scanned: overdue?.length ?? 0, notified });
    });
}
