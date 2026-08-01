import { z } from 'zod';
import { apiHandler, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { notifyUser } from '@/lib/notifications';
import { ticketActionSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const actionSchema = z.enum(['assign', 'close', 'reopen']);

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string; action: string }> },
) {
    return apiHandler(async () => {
        const actor = await requireUser();
        const { id, action: rawAction } = await context.params;
        const ticketId = z.uuid().parse(id);
        const action = actionSchema.parse(rawAction);
        const input = await parseJson(request, ticketActionSchema);
        if (isDemoMode) return jsonOk({ id: ticketId, action, status: 'accepted' });

        const admin = createSupabaseAdminClient();
        const { data: status, error } = await admin.rpc('perform_ticket_action', {
            p_ticket_id: ticketId,
            p_actor_id: actor.id,
            p_action: action,
            p_assignee_id: input.assigneeId ?? null,
        });
        if (error) throw error;

        const { data: ticket } = await admin
            .from('tickets')
            .select('display_id,title,assignee_id')
            .eq('id', ticketId)
            .single();
        if (ticket) {
            // No reporter is tracked anymore, so the only recipient left to
            // notify on close/reopen is the (current) assignee, if any.
            const recipientId = action === 'assign' ? input.assigneeId : ticket.assignee_id;
            if (recipientId && recipientId !== actor.id) {
                await notifyUser({
                    userId: recipientId,
                    title: `Ticket ${action} · TKT-${ticket.display_id}`,
                    message: ticket.title,
                    href: '/app?section=tickets',
                });
            }
        }
        return jsonOk({ id: ticketId, status });
    });
}
