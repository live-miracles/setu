import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { claimIdempotencyKey } from '@/lib/idempotency';
import { createTicketSchema, paginationSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { enqueueNotification } from '@/lib/notifications';

export async function GET(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.tickets);
        const url = new URL(request.url);
        const params = paginationSchema.parse(Object.fromEntries(url.searchParams));
        const from = (params.page - 1) * params.pageSize;
        const supabase = await createServerSupabaseClient();
        let query = supabase
            .from('tickets')
            .select(
                '*,reporter:profiles!reporter_id(id,name),assignee:profiles!assignee_id(id,name),ticket_comments(id,message,created_at,author:profiles!author_id(id,name))',
                { count: 'exact' },
            )
            .order('updated_at', { ascending: false })
            .range(from, from + params.pageSize - 1);
        if (params.q) query = query.ilike('title', `%${params.q}%`);
        const { data, count, error } = await query;
        if (error) throw error;
        return jsonOk({ items: data, total: count ?? 0, ...params });
    });
}

export async function POST(request: Request) {
    return apiHandler(async () => {
        const actor = await requireUser();
        const input = await parseJson(request, createTicketSchema);
        if (isDemoMode) {
            return jsonCreated({
                id: crypto.randomUUID(),
                reporterId: actor.id,
                status: 'unassigned',
                ...input,
            });
        }
        await claimIdempotencyKey(request, actor.id, 'ticket:create');
        const admin = createSupabaseAdminClient();
        const { data: ticket, error } = await admin
            .from('tickets')
            .insert({
                title: input.title,
                description: input.description,
                location_id: input.locationId,
                location_name: input.locationName,
                priority: input.priority,
                reporter_id: actor.id,
            })
            .select()
            .single();
        if (error) throw error;
        await admin.from('audit_events').insert({
            actor_id: actor.id,
            entity_type: 'ticket',
            entity_id: ticket.id,
            action: 'create',
            after_state: ticket,
        });
        const { data: administrators } = await admin
            .from('profiles')
            .select('id')
            .eq('role', 'admin')
            .eq('status', 'active')
            .neq('id', actor.id);
        await Promise.allSettled(
            (administrators ?? []).map(({ id }) =>
                enqueueNotification({
                    recipientId: id,
                    eventKey: `ticket:${ticket.id}:created`,
                    title: `New ticket · TKT-${ticket.display_id}`,
                    message: `${actor.name}: ${ticket.title}`,
                    href: '/app?section=tickets',
                }),
            ),
        );
        return jsonCreated(ticket);
    });
}
