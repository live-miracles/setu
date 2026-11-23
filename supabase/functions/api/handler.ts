import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Context } from 'npm:hono@4';
import { ApiError, requireAllowedEmailDomain } from './core.ts';
import { operations } from './operations.ts';
import { parseApiRequest } from './validation.ts';

const appOrigin = Deno.env.get('SETU_APP_ORIGIN') || '';

function respond(value: unknown, status = 200): Response {
    return Response.json(value, { status });
}

// Authenticates the caller, finds the operation, validates its arguments and
// runs it. Everything an operation shares lives here; operations.ts lists what
// they do. Failures are a status plus a message: ApiError carries its own
// status, anything else thrown is a 400 with its message.
export async function handleApiRequest(context: Context): Promise<Response> {
    const request = context.req.raw;
    if (!appOrigin) return respond({ error: 'SETU_APP_ORIGIN is not configured.' }, 500);
    const authorization = request.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !key || !serviceKey)
        return respond({ error: 'Server authentication is not configured.' }, 500);
    if (!authorization) return respond({ error: 'Authentication is required.' }, 401);
    const client = createClient(url, key, {
        global: { headers: { Authorization: authorization } },
    });
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return respond({ error: 'Authentication is required.' }, 401);

    let body: ReturnType<typeof parseApiRequest>;
    try {
        body = parseApiRequest(await request.json());
    } catch (error) {
        return respond(
            { error: error instanceof Error ? error.message : 'The request body is invalid.' },
            400,
        );
    }
    const pathOperation = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop() || '';
    const name = body.operation || (pathOperation !== 'api' ? pathOperation : '');
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    try {
        await requireAllowedEmailDomain(admin, authData.user.email || '');
        const operation = Object.hasOwn(operations, name) ? operations[name] : undefined;
        if (!operation) return respond({ error: `Unknown operation: ${name}.` }, 404);
        const args = operation.parse(body.args || []);
        if (!args) return respond({ error: `Invalid arguments for ${name}.` }, 400);
        const value = await operation.run({ client, admin, userId: authData.user.id }, args);
        return respond(value ?? null);
    } catch (error) {
        console.error(error);
        return respond(
            { error: error instanceof Error ? error.message : 'Unable to complete the request.' },
            error instanceof ApiError ? error.status : 400,
        );
    }
}
