import { z } from 'zod';
import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { claimIdempotencyKey } from '@/lib/idempotency';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const inviteSchema = z.object({
    email: z.email().transform((value) => value.toLowerCase()),
    name: z.string().trim().min(2).max(120),
    role: z.enum(['admin', 'member']).default('member'),
    departmentId: z.uuid().optional(),
    timezone: z.string().trim().min(3).max(100).default('Asia/Kolkata'),
});

export async function GET() {
    return apiHandler(async () => {
        await requireAdmin();
        if (isDemoMode) return jsonOk(demoState.profiles);
        const { data, error } = await createSupabaseAdminClient()
            .from('profiles')
            .select('*,departments(name)')
            .order('name');
        if (error) throw error;
        return jsonOk(data);
    });
}

export async function POST(request: Request) {
    return apiHandler(async () => {
        const actor = await requireAdmin();
        const input = await parseJson(request, inviteSchema);
        if (isDemoMode) {
            return jsonCreated({ id: crypto.randomUUID(), status: 'invited', ...input });
        }
        await claimIdempotencyKey(request, actor.id, 'profile:invite');
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin
            .from('profiles')
            .insert({
                email: input.email,
                name: input.name,
                role: input.role,
                status: 'invited',
                department_id: input.departmentId,
                timezone: input.timezone,
            })
            .select()
            .single();
        if (error) throw error;
        await admin.from('audit_events').insert({
            actor_id: actor.id,
            entity_type: 'profile',
            entity_id: data.id,
            action: 'invite',
            after_state: data,
        });
        return jsonCreated(data);
    });
}
