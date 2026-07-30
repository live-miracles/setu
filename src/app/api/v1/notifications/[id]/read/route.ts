import { z } from 'zod';
import { apiHandler, jsonOk } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
    return apiHandler(async () => {
        const user = await requireUser();
        const id = z.uuid().parse((await context.params).id);
        if (isDemoMode) return jsonOk({ id, read: true });
        const { error } = await (
            await createServerSupabaseClient()
        )
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', id)
            .eq('recipient_id', user.id);
        if (error) throw error;
        return jsonOk({ id, read: true });
    });
}
