import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { notifyUser } from '@/lib/notifications';
import { createTicketSchema, paginationSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.tickets);
        const url = new URL(request.url);
        const params = paginationSchema.parse(Object.fromEntries(url.searchParams));
        const from = (params.page - 1) * params.pageSize;
        let query = createSupabaseAdminClient()
            .from('tickets')
            .select('*,assignee:users!assignee_id(id,name)', { count: 'exact' })
            .order('display_id', { ascending: false })
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
            return jsonCreated({ id: crypto.randomUUID(), status: 'unassigned', ...input });
        }
        const admin = createSupabaseAdminClient();
        const { data: displayId, error: counterError } = await admin.rpc('next_display_id', {
            p_key: 'ticket_display_id',
        });
        if (counterError) throw counterError;

        const { data: ticket, error } = await admin
            .from('tickets')
            .insert({
                display_id: displayId,
                title: input.title,
                description: input.description,
            })
            .select()
            .single();
        if (error) throw error;

        const { data: administrators } = await admin
            .from('users')
            .select('id')
            .eq('role', 'admin')
            .neq('id', actor.id);
        await Promise.allSettled(
            (administrators ?? []).map(({ id }) =>
                notifyUser({
                    userId: id,
                    title: `New ticket · TKT-${ticket.display_id}`,
                    message: `${actor.name}: ${ticket.title}`,
                    href: '/app?section=tickets',
                }),
            ),
        );
        return jsonCreated(ticket);
    });
}
