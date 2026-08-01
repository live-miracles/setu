import { z } from 'zod';
import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
    name: z.string().trim().min(2).max(120),
    url: z.url(),
});

export async function GET() {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.links);
        const { data, error } = await createSupabaseAdminClient()
            .from('links')
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
            .from('links')
            .insert({ name: input.name, url: input.url })
            .select()
            .single();
        if (error) throw error;
        return jsonCreated(data);
    });
}
