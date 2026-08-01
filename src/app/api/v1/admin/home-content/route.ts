import { z } from 'zod';
import { apiHandler, jsonOk, parseJson } from '@/lib/api';
import { requireAdmin, requireUser } from '@/lib/auth';
import { demoState } from '@/demo/data';
import { isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const urlOrEmpty = z.union([z.url(), z.literal('')]);

const schema = z.object({
    supportMessage: z.string().trim().max(2000),
    guidelines: z.string().trim().max(8000),
    whatsappUrl: urlOrEmpty,
    tutorialUrl: urlOrEmpty,
});

// Home content lives as rows in the generic `settings` key/value table
// rather than its own table.
const KEYS = {
    supportMessage: 'support_message',
    guidelines: 'guidelines',
    whatsappUrl: 'whatsapp_url',
    tutorialUrl: 'tutorial_url',
} as const;

export async function GET() {
    return apiHandler(async () => {
        await requireUser();
        if (isDemoMode) return jsonOk(demoState.homeContent);
        const { data, error } = await createSupabaseAdminClient()
            .from('settings')
            .select('id,value')
            .in('id', Object.values(KEYS));
        if (error) throw error;
        const byId = Object.fromEntries((data ?? []).map((row) => [row.id, row.value]));
        return jsonOk({
            supportMessage: byId[KEYS.supportMessage] ?? '',
            guidelines: byId[KEYS.guidelines] ?? '',
            whatsappUrl: byId[KEYS.whatsappUrl] ?? '',
            tutorialUrl: byId[KEYS.tutorialUrl] ?? '',
        });
    });
}

export async function PUT(request: Request) {
    return apiHandler(async () => {
        await requireAdmin();
        const input = await parseJson(request, schema);
        if (isDemoMode) return jsonOk(input);
        const { error } = await createSupabaseAdminClient()
            .from('settings')
            .upsert([
                { id: KEYS.supportMessage, value: input.supportMessage },
                { id: KEYS.guidelines, value: input.guidelines },
                { id: KEYS.whatsappUrl, value: input.whatsappUrl },
                { id: KEYS.tutorialUrl, value: input.tutorialUrl },
            ]);
        if (error) throw error;
        return jsonOk(input);
    });
}
