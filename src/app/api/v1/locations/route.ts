import { z } from 'zod';
import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const schema = z.object({
    name: z.string().trim().min(2).max(120),
});

export async function GET() {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) {
            return jsonOk([
                {
                    id: 'd2d862db-2d88-4564-8be8-b974c1ff81a0',
                    name: 'Drishti Studio',
                },
                {
                    id: 'f24dcb30-6fef-44fb-8227-b506d23604d4',
                    name: 'Drishti Store',
                },
            ]);
        }
        const { data, error } = await (
            await createServerSupabaseClient()
        )
            .from('locations')
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
            .from('locations')
            .insert({ name: input.name })
            .select()
            .single();
        if (error) throw error;
        return jsonCreated(data);
    });
}
