import { z } from 'zod';
import { apiHandler, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { enqueueNotification } from '@/lib/notifications';
import { requestActionSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireIdempotencyKey } from '@/domain/workflows';

const actionSchema = z.enum(['submit', 'approve', 'reject', 'issue', 'return', 'cancel', 'close']);

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string; action: string }> },
) {
    return apiHandler(async () => {
        const actor = await requireUser();
        const { id, action: rawAction } = await context.params;
        const requestId = z.uuid().parse(id);
        const action = actionSchema.parse(rawAction);
        const input = await parseJson(request, requestActionSchema);
        const key = requireIdempotencyKey(request.headers.get('Idempotency-Key'));

        if (isDemoMode) return jsonOk({ id: requestId, action, status: 'accepted' });

        const admin = createSupabaseAdminClient();
        const { data: status, error } = await admin.rpc('perform_inventory_request_action', {
            p_request_id: requestId,
            p_actor_id: actor.id,
            p_action: action,
            p_note: input.note,
            p_return_items: input.returns,
            p_idempotency_key: key,
        });
        if (error) throw error;

        const { data: inventoryRequest } = await admin
            .from('inventory_requests')
            .select('requester_id,display_id')
            .eq('id', requestId)
            .single();
        if (inventoryRequest && inventoryRequest.requester_id !== actor.id) {
            await enqueueNotification({
                recipientId: inventoryRequest.requester_id,
                eventKey: `inventory:${requestId}:${action}:${key}`,
                title: `Inventory request ${action}`,
                message: `REQ-${inventoryRequest.display_id} is now ${status}.`,
                href: '/app?section=inventory',
            });
        }
        return jsonOk({ id: requestId, status });
    });
}
