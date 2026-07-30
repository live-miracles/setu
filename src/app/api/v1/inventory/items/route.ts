import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { createInventoryItemSchema, paginationSchema } from '@/lib/schemas';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { claimIdempotencyKey } from '@/lib/idempotency';

export async function GET(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.inventory);
        const url = new URL(request.url);
        const params = paginationSchema.parse(Object.fromEntries(url.searchParams));
        const from = (params.page - 1) * params.pageSize;
        let query = (await createServerSupabaseClient())
            .from('inventory_items')
            .select('*,equipment_types(name),locations(name)', { count: 'exact' })
            .order('name')
            .range(from, from + params.pageSize - 1);
        if (params.q) query = query.ilike('name', `%${params.q}%`);
        const { data, count, error } = await query;
        if (error) throw error;
        return jsonOk({ items: data, total: count ?? 0, ...params });
    });
}

export async function POST(request: Request) {
    return apiHandler(async () => {
        const actor = await requireAdmin();
        const input = await parseJson(request, createInventoryItemSchema);
        if (isDemoMode) {
            return jsonCreated({
                id: crypto.randomUUID(),
                ...input,
                createdBy: actor.id,
            });
        }

        await claimIdempotencyKey(request, actor.id, 'inventory_item:create');
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin
            .from('inventory_items')
            .insert({
                name: input.name,
                equipment_type_id: input.equipmentTypeId,
                location_id: input.locationId ?? null,
                serial_number: input.serialNumber ?? null,
                total_quantity: input.totalQuantity,
                available_quantity: input.availableQuantity,
                admin_notes: input.adminNotes ?? null,
            })
            .select()
            .single();
        if (error) throw error;

        await admin.from('audit_events').insert({
            actor_id: actor.id,
            entity_type: 'inventory_item',
            entity_id: data.id,
            action: 'create',
            after_state: data,
        });
        return jsonCreated(data);
    });
}
