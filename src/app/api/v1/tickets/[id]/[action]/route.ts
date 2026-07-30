import { z } from 'zod';
import { apiHandler, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { requireIdempotencyKey } from '@/domain/workflows';
import { isDemoMode } from '@/lib/env';
import { enqueueNotification } from '@/lib/notifications';
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
        const key = requireIdempotencyKey(request.headers.get('Idempotency-Key'));
        if (isDemoMode) return jsonOk({ id: ticketId, action, status: 'accepted' });

        const admin = createSupabaseAdminClient();
        const { data: status, error } = await admin.rpc('perform_ticket_action', {
            p_ticket_id: ticketId,
            p_actor_id: actor.id,
            p_action: action,
            p_assignee_id: input.assigneeId,
            p_idempotency_key: key,
        });
        if (error) throw error;

        const { data: ticket } = await admin
            .from('tickets')
            .select('display_id,title,reporter_id,assignee_id')
            .eq('id', ticketId)
            .single();
        if (ticket) {
            const recipients =
                action === 'assign'
                    ? [input.assigneeId]
                    : action === 'close'
                      ? [ticket.reporter_id]
                      : [ticket.reporter_id, ticket.assignee_id];
            await Promise.allSettled(
                [...new Set(recipients)]
                    .filter((id): id is string => Boolean(id) && id !== actor.id)
                    .map((recipientId) =>
                        enqueueNotification({
                            recipientId,
                            eventKey: `ticket:${ticketId}:${action}:${key}`,
                            title: `Ticket ${action} · TKT-${ticket.display_id}`,
                            message: ticket.title,
                            href: '/app?section=tickets',
                        }),
                    ),
            );
        }
        return jsonOk({ id: ticketId, status });
    });
}
