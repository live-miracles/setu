import { apiHandler, jsonOk } from '@/lib/api';
import { requireCronSecret } from '@/lib/cron';
import { isDemoMode } from '@/lib/env';
import { dispatchPendingDeliveries } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    return apiHandler(async () => {
        requireCronSecret(request);
        if (isDemoMode) return jsonOk({ sent: 0, failed: 0 });
        return jsonOk(await dispatchPendingDeliveries(100));
    });
}
