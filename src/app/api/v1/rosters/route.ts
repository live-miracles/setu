import { apiHandler, jsonCreated, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { notifyUser } from '@/lib/notifications';
import { createRosterSchema, paginationSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.rosters);
        const url = new URL(request.url);
        const params = paginationSchema.parse(Object.fromEntries(url.searchParams));
        const from = (params.page - 1) * params.pageSize;
        const { data, count, error } = await createSupabaseAdminClient()
            .from('rosters')
            .select('*,user:users!user_id(id,name)', { count: 'exact' })
            .order('start_date', { ascending: false })
            .range(from, from + params.pageSize - 1);
        if (error) throw error;
        return jsonOk({ items: data, total: count ?? 0, ...params });
    });
}

export async function POST(request: Request) {
    return apiHandler(async () => {
        await requireAdmin();
        const input = await parseJson(request, createRosterSchema);
        if (isDemoMode) return jsonCreated({ id: crypto.randomUUID(), ...input });
        const admin = createSupabaseAdminClient();
        const { data: roster, error } = await admin
            .from('rosters')
            .insert({
                name: input.name,
                start_date: input.startDate,
                end_date: input.endDate,
                start_time: input.startTime,
                end_time: input.endTime,
                user_id: input.userId,
            })
            .select()
            .single();
        if (error) throw error;

        await notifyUser({
            userId: input.userId,
            title: 'New roster assignment',
            message: `${input.name}: ${input.startDate} ${input.startTime} - ${input.endDate} ${input.endTime}`,
            href: '/app?section=roster',
        });
        return jsonCreated(roster);
    });
}
