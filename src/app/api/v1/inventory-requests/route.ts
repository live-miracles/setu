import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { claimIdempotencyKey } from '@/lib/idempotency';
import { createInventoryRequestSchema, paginationSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { enqueueNotification } from '@/lib/notifications';

export async function GET(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.requests);
        const url = new URL(request.url);
        const params = paginationSchema.parse(Object.fromEntries(url.searchParams));
        const from = (params.page - 1) * params.pageSize;
        const supabase = await createServerSupabaseClient();
        let query = supabase
            .from('inventory_requests')
            .select(
                '*,requester:profiles!requester_id(id,name,department_id),inventory_request_items(*,inventory_items(id,name))',
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
        const input = await parseJson(request, createInventoryRequestSchema);
        if (isDemoMode) {
            return jsonCreated({
                id: crypto.randomUUID(),
                status: 'submitted',
                requesterId: actor.id,
                ...input,
            });
        }
        await claimIdempotencyKey(request, actor.id, 'inventory_request:create');
        const admin = createSupabaseAdminClient();
        const { data: created, error } = await admin
            .from('inventory_requests')
            .insert({
                title: input.title,
                requester_id: actor.id,
                from_date: input.fromDate,
                to_date: input.toDate,
                purpose: input.purpose,
                status: 'submitted',
                submitted_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (error) throw error;

        const { error: itemsError } = await admin.from('inventory_request_items').insert(
            input.items.map((item) => ({
                request_id: created.id,
                inventory_item_id: item.inventoryItemId,
                quantity: item.quantity,
            })),
        );
        if (itemsError) {
            await admin.from('inventory_requests').delete().eq('id', created.id);
            throw itemsError;
        }
        await admin.from('audit_events').insert({
            actor_id: actor.id,
            entity_type: 'inventory_request',
            entity_id: created.id,
            action: 'create_and_submit',
            after_state: created,
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
                    eventKey: `inventory:${created.id}:submitted`,
                    title: `New inventory request · REQ-${created.display_id}`,
                    message: `${actor.name} requested equipment for ${input.title}.`,
                    href: '/app?section=inventory',
                }),
            ),
        );
        return jsonCreated(created);
    });
}
