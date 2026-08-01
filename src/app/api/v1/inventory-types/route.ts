import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { createInventoryTypeSchema, paginationSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.inventoryTypes);
        const url = new URL(request.url);
        const params = paginationSchema.parse(Object.fromEntries(url.searchParams));
        const from = (params.page - 1) * params.pageSize;
        let query = createSupabaseAdminClient()
            .from('inventory_types_with_availability')
            .select('*', { count: 'exact' })
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
        await requireAdmin();
        const input = await parseJson(request, createInventoryTypeSchema);
        if (isDemoMode) return jsonCreated({ id: crypto.randomUUID(), ...input });
        const { data, error } = await createSupabaseAdminClient()
            .from('inventory_types')
            .insert({
                name: input.name,
                description: input.description ?? null,
                requestable: input.requestable,
                total_quantity: input.totalQuantity,
                image_drive_id: input.imageDriveId ?? null,
            })
            .select()
            .single();
        if (error) throw error;
        return jsonCreated(data);
    });
}
