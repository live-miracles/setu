import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { notifyUser } from '@/lib/notifications';
import { createProgramRequestSchema, paginationSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.programRequests);
        const url = new URL(request.url);
        const params = paginationSchema.parse(Object.fromEntries(url.searchParams));
        const from = (params.page - 1) * params.pageSize;
        const admin = createSupabaseAdminClient();
        let query = admin
            .from('program_requests')
            .select(
                '*,requester:users!user_id(id,name,departments(name)),places(name),sessions(*),comments(id,timestamp,message,author:users!user_id(id,name))',
                { count: 'exact' },
            )
            .order('display_id', { ascending: false })
            .range(from, from + params.pageSize - 1);
        if (params.q) query = query.ilike('name', `%${params.q}%`);
        const { data, count, error } = await query;
        if (error) throw error;
        return jsonOk({ items: data, total: count ?? 0, ...params });
    });
}

export async function POST(request: Request) {
    return apiHandler(async () => {
        const actor = await requireUser();
        const input = await parseJson(request, createProgramRequestSchema);
        if (isDemoMode) {
            return jsonCreated({
                id: crypto.randomUUID(),
                displayId: 0,
                status: 'submitted',
                userId: actor.id,
                ...input,
            });
        }
        const admin = createSupabaseAdminClient();
        const { data: displayId, error: counterError } = await admin.rpc('next_display_id', {
            p_key: 'program_request_display_id',
        });
        if (counterError) throw counterError;

        const { data: created, error } = await admin
            .from('program_requests')
            .insert({
                display_id: displayId,
                name: input.name,
                type: input.type,
                user_id: actor.id,
                place_id: input.placeId,
                status: 'submitted',
            })
            .select()
            .single();
        if (error) throw error;

        const { error: sessionsError } = await admin.from('sessions').insert(
            input.sessions.map((session) => ({
                request_id: created.id,
                name: session.name,
                type: session.type,
                start_date_time: session.startDateTime,
                end_date_time: session.endDateTime,
            })),
        );
        if (sessionsError) {
            await admin.from('program_requests').delete().eq('id', created.id);
            throw sessionsError;
        }

        const { data: administrators } = await admin
            .from('users')
            .select('id')
            .eq('role', 'admin')
            .neq('id', actor.id);
        await Promise.allSettled(
            (administrators ?? []).map(({ id }) =>
                notifyUser({
                    userId: id,
                    title: `New program request · PRG-${created.display_id}`,
                    message: `${actor.name} requested a program: ${input.name}.`,
                    href: '/app?section=programs',
                }),
            ),
        );
        return jsonCreated(created);
    });
}
