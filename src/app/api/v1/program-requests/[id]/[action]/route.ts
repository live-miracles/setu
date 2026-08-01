import { z } from 'zod';
import { apiHandler, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { notifyUser } from '@/lib/notifications';
import { programRequestActionSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const actionSchema = z.enum(['submit', 'approve', 'reject', 'cancel', 'close']);

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string; action: string }> },
) {
    return apiHandler(async () => {
        const actor = await requireUser();
        const { id, action: rawAction } = await context.params;
        const requestId = z.uuid().parse(id);
        const action = actionSchema.parse(rawAction);
        const input = await parseJson(request, programRequestActionSchema);

        if (isDemoMode) return jsonOk({ id: requestId, action, status: 'accepted' });

        const admin = createSupabaseAdminClient();
        const { data: status, error } = await admin.rpc('perform_program_request_action', {
            p_request_id: requestId,
            p_actor_id: actor.id,
            p_action: action,
            p_note: input.note,
        });
        if (error) throw error;

        const { data: programRequest } = await admin
            .from('program_requests')
            .select('user_id,display_id')
            .eq('id', requestId)
            .single();
        if (programRequest && programRequest.user_id !== actor.id) {
            await notifyUser({
                userId: programRequest.user_id,
                title: `Program request ${action}`,
                message: `PRG-${programRequest.display_id} is now ${status}.`,
                href: '/app?section=programs',
            });
        }
        return jsonOk({ id: requestId, status });
    });
}
