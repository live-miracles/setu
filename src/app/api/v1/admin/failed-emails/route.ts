import { apiHandler, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
    return apiHandler(async () => {
        await requireAdmin();
        if (isDemoMode) return jsonOk([]);
        const { data, error } = await createSupabaseAdminClient()
            .from('failed_emails')
            .select('*,user:users!user_id(id,name)')
            .order('timestamp', { ascending: false })
            .limit(100);
        if (error) throw error;
        return jsonOk(data);
    });
}
