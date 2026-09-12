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

// Returns false when the browser is about to navigate away to Google — the
// caller should stop rather than briefly rendering the app with no session.
export async function ensureAuthenticated(): Promise<boolean> {
    const { data, error } = await supabase().auth.getSession();
    if (error) throw error;
    if (data.session) return true;

    const { error: signInError } = await supabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin,
            // Signing out only clears the Supabase session, not Google's own
            // SSO session in the browser — without this, Google silently
            // re-authenticates the same account instead of offering a choice.
            queryParams: { prompt: 'select_account' },
        },
    });
    if (signInError) throw signInError;
    return false;
}

export async function currentUserEmail(): Promise<string | null> {
    const { data } = await supabase().auth.getSession();
    return data.session?.user.email ?? null;
}

// Reload after sign-out so boot() re-runs ensureAuthenticated() and picks up
// the (now cleared) session instead of the app trying to keep running against
// stale in-memory state.
export async function signOutAndReload(): Promise<void> {
    await supabase().auth.signOut();
    window.location.reload();
}
