import { supabase, supabaseHttpConfig } from './supabase';

// The UI talks to exactly one application API: the protected Supabase Edge
// Function. Local development uses the same path as Vercel, so the database,
// RLS policies and backend implementation are always the source of truth.

type AsyncApi = { [K in keyof Api]: (...args: Parameters<Api[K]>) => Promise<ReturnType<Api[K]>> };

function callBackend<K extends keyof Api>(
    fnName: K,
    ...args: Parameters<Api[K]>
): Promise<ReturnType<Api[K]>> {
    return supabase()
        .auth.getSession()
        .then(async ({ data: sessionData, error: sessionError }) => {
            if (sessionError) throw sessionError;
            const token = sessionData.session?.access_token;
            if (!token) throw new Error(`${String(fnName)}: authentication is required`);
            const { url, publishableKey } = supabaseHttpConfig();
            const response = await fetch(`${url}/functions/v1/api/${String(fnName)}`, {
                method: 'POST',
                headers: {
                    apikey: publishableKey,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ args }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok)
                throw new Error(
                    `${String(fnName)} (HTTP ${response.status}): ${data?.error || 'Unable to complete the request.'}`,
                );
            return data as ReturnType<Api[K]>;
        });
}

function callBackendOperation(fnName: keyof Api, args: unknown[]): Promise<unknown> {
    return callBackend(fnName, ...(args as never));
}

// Api is a deliberately typed facade over one HTTP operation endpoint. A
// proxy keeps the public `api.method(...)` ergonomics while ensuring every
// operation gets the same auth, headers, error handling, and serialization.
export const api: AsyncApi = new Proxy({} as AsyncApi, {
    get:
        (_target, property: string) =>
        (...args: unknown[]) =>
            callBackendOperation(property as keyof Api, args),
});
