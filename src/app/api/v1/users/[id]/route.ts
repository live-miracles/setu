import { z } from 'zod';
import { apiHandler, ConflictError, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const updateSchema = z
    .object({
        role: z.enum(['admin', 'member']).optional(),
        status: z.enum(['invited', 'active', 'disabled']).optional(),
        departmentId: z.uuid().nullable().optional(),
        timezone: z.string().trim().min(3).max(100).optional(),
    })
    .refine((input) => Object.keys(input).length > 0, {
        message: 'At least one change is required.',
    });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    return apiHandler(async () => {
        const actor = await requireAdmin();
        const profileId = z.uuid().parse((await context.params).id);
        const input = await parseJson(request, updateSchema);
        if (actor.id === profileId && (input.status === 'disabled' || input.role === 'member')) {
            throw new ConflictError('You cannot disable or remove your own administrator access.');
        }
        if (isDemoMode) return jsonOk({ id: profileId, ...input });

        const admin = createSupabaseAdminClient();
        const { data: before, error: beforeError } = await admin
            .from('profiles')
            .select('*')
            .eq('id', profileId)
            .single();
        if (beforeError) throw beforeError;

        const { data, error } = await admin
            .from('profiles')
            .update({
                role: input.role,
                status: input.status,
                department_id: input.departmentId,
                timezone: input.timezone,
            })
            .eq('id', profileId)
            .select()
            .single();
        if (error) throw error;

        await admin.from('audit_events').insert({
            actor_id: actor.id,
            entity_type: 'profile',
            entity_id: profileId,
            action: 'update_access',
            before_state: before,
            after_state: data,
        });
        return jsonOk(data);
    });
}
