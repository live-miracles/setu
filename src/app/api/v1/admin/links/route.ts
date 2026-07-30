import { z } from 'zod';
import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { claimIdempotencyKey } from '@/lib/idempotency';

const schema = z.object({
    name: z.string().trim().min(2).max(120),
    url: z.url(),
    displayOrder: z.number().int().min(0).default(0),
    enabled: z.boolean().default(true),
});

export async function GET() {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.links);
        const { data, error } = await (
            await createServerSupabaseClient()
        )
            .from('links')
            .select('*')
            .order('display_order');
        if (error) throw error;
        return jsonOk(data);
    });
}

export async function POST(request: Request) {
    return apiHandler(async () => {
        const actor = await requireAdmin();
        const input = await parseJson(request, schema);
        if (isDemoMode) return jsonCreated({ id: crypto.randomUUID(), ...input });
        await claimIdempotencyKey(request, actor.id, 'link:create');
        const { data, error } = await createSupabaseAdminClient()
            .from('links')
            .insert({
                name: input.name,
                url: input.url,
                display_order: input.displayOrder,
                enabled: input.enabled,
            })
            .select()
            .single();
        if (error) throw error;
        return jsonCreated(data);
    });
}
