import { z } from 'zod';
import { apiHandler, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const schema = z.object({
    supportMessage: z.string().trim().max(2000),
    guidelines: z.string().trim().max(8000),
    whatsappUrl: z.url().nullable(),
    tutorialUrl: z.url().nullable(),
});

export async function GET() {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.homeContent);
        const { data, error } = await (
            await createServerSupabaseClient()
        )
            .from('home_content')
            .select('*')
            .single();
        if (error) throw error;
        return jsonOk(data);
    });
}

export async function PUT(request: Request) {
    return apiHandler(async () => {
        const actor = await requireAdmin();
        const input = await parseJson(request, schema);
        if (isDemoMode) return jsonOk(input);
        const { data, error } = await createSupabaseAdminClient()
            .from('home_content')
            .upsert({
                id: true,
                support_message: input.supportMessage,
                guidelines: input.guidelines,
                whatsapp_url: input.whatsappUrl,
                tutorial_url: input.tutorialUrl,
                updated_by: actor.id,
            })
            .select()
            .single();
        if (error) throw error;
        return jsonOk(data);
    });
}
