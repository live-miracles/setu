import { ConflictError } from '@/lib/api';
import { requireIdempotencyKey } from '@/domain/workflows';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function claimIdempotencyKey(request: Request, userId: string, scope: string) {
    const key = requireIdempotencyKey(request.headers.get('Idempotency-Key'));
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from('idempotency_keys').insert({
        user_id: userId,
        scope,
        key,
    });

    if (error?.code === '23505') {
        throw new ConflictError('This operation was already processed.');
    }
    if (error) throw error;
    return key;
}
