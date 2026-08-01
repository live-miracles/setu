import { z } from 'zod';
import { apiHandler, ConflictError, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const updateSchema = z
    .object({
        role: z.enum(['admin', 'member']).optional(),
        departmentId: z.uuid().nullable().optional(),
        timezone: z.string().trim().min(3).max(100).optional(),
    })
    .refine((input) => Object.keys(input).length > 0, {
        message: 'At least one change is required.',
    });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    return apiHandler(async () => {
        const actor = await requireAdmin();
        const userId = z.email().parse((await context.params).id);
        const input = await parseJson(request, updateSchema);
        if (actor.id === userId && input.role === 'member') {
            throw new ConflictError('You cannot remove your own administrator access.');
        }
        if (isDemoMode) return jsonOk({ id: userId, ...input });

        const admin = createSupabaseAdminClient();
        const { data, error } = await admin
            .from('users')
            .update({
                role: input.role,
                department_id: input.departmentId,
                timezone: input.timezone,
            })
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return jsonOk(data);
    });
}
