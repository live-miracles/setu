import { z } from 'zod';
import { apiHandler, jsonCreated, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { addCommentSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    return apiHandler(async () => {
        const actor = await requireUser();
        const requestId = z.uuid().parse((await context.params).id);
        const input = await parseJson(request, addCommentSchema);
        if (isDemoMode) {
            return jsonCreated({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                author: { id: actor.id, name: actor.name },
                message: input.message,
            });
        }
        const { data, error } = await createSupabaseAdminClient()
            .from('comments')
            .insert({ program_request_id: requestId, user_id: actor.id, message: input.message })
            .select('id,timestamp,message')
            .single();
        if (error) throw error;
        return jsonCreated({ ...data, author: { id: actor.id, name: actor.name } });
    });
}
