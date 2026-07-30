import { z } from 'zod';
import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const schema = z.object({
    name: z.string().trim().min(2).max(120),
    shortName: z.string().trim().max(20).optional(),
});

export async function GET() {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk([{ id: 'demo', name: 'Live Stream' }]);
        const { data, error } = await (
            await createServerSupabaseClient()
        )
            .from('departments')
            .select('*')
            .order('name');
        if (error) throw error;
        return jsonOk(data);
    });
}

export async function POST(request: Request) {
    return apiHandler(async () => {
        await requireAdmin();
        const input = await parseJson(request, schema);
        if (isDemoMode) return jsonCreated({ id: crypto.randomUUID(), ...input });
        const { data, error } = await createSupabaseAdminClient()
            .from('departments')
            .insert({ name: input.name, short_name: input.shortName })
            .select()
            .single();
        if (error) throw error;
        return jsonCreated(data);
    });
}
