import { formatISO } from 'date-fns';
import { apiHandler, jsonOk } from '@/lib/api';
import { requireCronSecret } from '@/lib/cron';
import { isDemoMode } from '@/lib/env';
import { notifyUser } from '@/lib/notifications';
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
            .select('id,display_id,user_id,end_date')
            .eq('status', 'issued')
            .lt('end_date', today)
            .limit(500);
        if (error) throw error;

        for (const item of overdue ?? []) {
            await notifyUser({
                userId: item.user_id,
                title: `REQ-${item.display_id} is overdue`,
                message: `The equipment was due on ${item.end_date}. Please arrange its return.`,
                href: '/app?section=inventory',
            });
        }

        return jsonOk({ scanned: overdue?.length ?? 0, notified: overdue?.length ?? 0 });
    });
}
