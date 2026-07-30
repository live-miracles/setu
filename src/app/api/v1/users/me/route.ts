import { z } from 'zod';
import { apiHandler, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const updateSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    whatsapp: z.string().trim().max(40).nullable().optional(),
    timezone: z.string().trim().min(3).max(100).optional(),
    notificationEmail: z.boolean().optional(),
    notificationPush: z.boolean().optional(),
});

export async function PATCH(request: Request) {
    return apiHandler(async () => {
        const user = await requireUser();
        const input = await parseJson(request, updateSchema);
        if (isDemoMode) return jsonOk({ ...user, ...input });
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin
            .from('profiles')
            .update({
                name: input.name,
                phone: input.phone,
                whatsapp: input.whatsapp,
                timezone: input.timezone,
                notification_email: input.notificationEmail,
                notification_push: input.notificationPush,
            })
            .eq('id', user.id)
            .select()
            .single();
        if (error) throw error;
        return jsonOk(data);
    });
}
