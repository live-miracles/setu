import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const __SETU_SUPABASE_URL__: string | undefined;
declare const __SETU_SUPABASE_PUBLISHABLE_KEY__: string | undefined;

let client: SupabaseClient | null = null;

function configuredValue(value: string | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function supabaseHttpConfig(): { url: string; publishableKey: string } {
    return {
        url: configuredValue(
            typeof __SETU_SUPABASE_URL__ === 'undefined' ? '' : __SETU_SUPABASE_URL__,
        ),
        publishableKey: configuredValue(
            typeof __SETU_SUPABASE_PUBLISHABLE_KEY__ === 'undefined'
                ? ''
                : __SETU_SUPABASE_PUBLISHABLE_KEY__,
        ),
    };
}

export function isSupabaseConfigured(): boolean {
    return Boolean(
        configuredValue(
            typeof __SETU_SUPABASE_URL__ === 'undefined' ? '' : __SETU_SUPABASE_URL__,
        ) &&
        configuredValue(
            typeof __SETU_SUPABASE_PUBLISHABLE_KEY__ === 'undefined'
                ? ''
                : __SETU_SUPABASE_PUBLISHABLE_KEY__,
        ),
    );
}

export function supabase(): SupabaseClient {
    if (client) return client;
    const { url, publishableKey } = supabaseHttpConfig();
    if (!url || !publishableKey) {
        throw new Error(
            'Setu is not configured. Set SETU_SUPABASE_URL and SETU_SUPABASE_PUBLISHABLE_KEY for this deployment.',
        );
    }
    client = createClient(url, publishableKey);
    return client;
}

export async function ensureAuthenticated(): Promise<void> {
    const { data, error } = await supabase().auth.getSession();
    if (error) throw error;
    if (data.session) return;

    const { error: signInError } = await supabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
    });
    if (signInError) throw signInError;
}
