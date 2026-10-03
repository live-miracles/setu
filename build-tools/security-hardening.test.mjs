import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const rootUrl = new URL('../', import.meta.url);

async function importSource(path, prelude = '') {
    const source = (await readFile(new URL(path, rootUrl), 'utf8')).replace(
        /^import[\s\S]*?;\n/gm,
        '',
    );
    const { code } = await transform(prelude + source, { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('API distinguishes missing credentials from missing server configuration', async () => {
    const environment = {
        SETU_APP_ORIGIN: 'https://app.example.test',
        SUPABASE_URL: 'https://project.example.test',
        SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    };
    globalThis.__handlerEnvironment = environment;
    const handler = await importSource(
        'supabase/functions/api/handler.ts',
        `const Deno = { env: { get: (name) => globalThis.__handlerEnvironment[name] || '' } };
         const createClient = () => { throw new Error('authentication client must not be created'); };\n`,
    );
    const context = (headers = {}) => ({
        req: {
            raw: new Request('https://api.example.test/functions/v1/api/whoAmI', {
                method: 'POST',
                headers,
                body: '{}',
            }),
        },
    });

    const missingCredentials = await handler.handleApiRequest(context());
    assert.equal(missingCredentials.status, 401);
    assert.deepEqual(await missingCredentials.json(), { error: 'Authentication is required.' });

    environment.SUPABASE_URL = '';
    const missingConfiguration = await handler.handleApiRequest(
        context({ Authorization: 'Bearer token' }),
    );
    assert.equal(missingConfiguration.status, 500);
    assert.deepEqual(await missingConfiguration.json(), {
        error: 'Server authentication is not configured.',
    });
    delete globalThis.__handlerEnvironment;
});

test('signed image uploads require access to their target resource', async () => {
    const images = await importSource(
        'supabase/functions/api/images.ts',
        `const requireNonEmpty = (value) => String(value).trim();
         const result = (response) => { if (response.error) throw new Error(response.error.message); return response.data; };
         const currentProfile = async (client) => client.profile;
         const currentWriter = currentProfile;\n`,
    );
    const rows = {
        inventory_types: [{ id: 'type-1' }],
        inventory_requests: [{ id: 'request-1', requester_id: 'owner-1', status: 'draft' }],
        inventory_request_participants: [{ request_id: 'request-1', profile_id: 'participant-1' }],
    };
    const query = (table) => {
        let values = rows[table];
        return {
            select() {
                return this;
            },
            eq(column, value) {
                values = values.filter((row) => row[column] === value);
                return this;
            },
            async single() {
                return values.length === 1
                    ? { data: values[0], error: null }
                    : { data: null, error: { message: 'not found' } };
            },
            then(resolve) {
                return Promise.resolve({ data: values, error: null }).then(resolve);
            },
        };
    };
    const signedPaths = [];
    const admin = {
        from: query,
        storage: {
            from: () => ({
                async createSignedUploadUrl(path) {
                    signedPaths.push(path);
                    return { data: { token: 'signed-token' }, error: null };
                },
            }),
        },
    };

    await assert.rejects(
        images.createImageUploadUrl(
            { profile: { id: 'unrelated-1', role: 'user' } },
            admin,
            'unrelated-1',
            'photo.png',
            'image/png',
            'inventory_request',
            'request-1',
        ),
        /not allowed/,
    );
    assert.equal(signedPaths.length, 0);

    const participantUpload = await images.createImageUploadUrl(
        { profile: { id: 'participant-1', role: 'user' } },
        admin,
        'participant-1',
        'photo.png',
        'image/png',
        'inventory_request',
        'request-1',
    );
    assert.equal(participantUpload.token, 'signed-token');
    assert.match(participantUpload.path, /^participant-1\/inventory_request\/request-1\//);

    await assert.rejects(
        images.createImageUploadUrl(
            { profile: { id: 'approver-1', role: 'approver' } },
            admin,
            'approver-1',
            'photo.png',
            'image/png',
            'inventory_type',
            'type-1',
        ),
        /Administrator access/,
    );
    const adminUpload = await images.createImageUploadUrl(
        { profile: { id: 'admin-1', role: 'admin' } },
        admin,
        'admin-1',
        'photo.webp',
        'image/webp',
        'inventory_type',
        'type-1',
    );
    assert.match(adminUpload.path, /^admin-1\/inventory_type\/type-1\//);
});

test('viewer comments are rejected before request access checks', async () => {
    const comments = await importSource(
        'supabase/functions/api/comments.ts',
        `const currentProfile = async () => ({ id: 'viewer-1', role: 'viewer' });
         const requireNonEmpty = (value) => String(value).trim();
         const result = (response) => response.data;
         const withLockedDedupe = async () => { throw new Error('must not claim a mutation'); };
         const commentDto = (value) => value;\n`,
    );
    await assert.rejects(
        comments.addComment({}, {}, 'viewer-1', 'request-1', 'hello', 'request-123'),
        /read-only/,
    );
});

test('idempotency claims and lookups are isolated by actor', async () => {
    const core = await importSource(
        'supabase/functions/api/core.ts',
        'const requiredStringArg = (value) => String(value).trim();\n',
    );
    const calls = [];
    const builder = {
        insert(value) {
            calls.push(['insert', value]);
            return Promise.resolve({ error: { code: '23505' } });
        },
        select() {
            calls.push(['select']);
            return this;
        },
        eq(column, value) {
            calls.push(['eq', column, value]);
            return this;
        },
        single() {
            calls.push(['single']);
            return Promise.resolve({
                data: { result: { ok: true }, completed: true },
                error: null,
            });
        },
    };
    const admin = { from: () => builder };
    const value = await core.withLockedDedupe(
        admin,
        'request:create',
        'request-123',
        'actor-a',
        async () => assert.fail('duplicate callback must not run'),
    );

    assert.deepEqual(value.result, { ok: true });
    assert.deepEqual(calls[0], [
        'insert',
        { actor_id: 'actor-a', scope: 'request:create', request_id: 'request-123' },
    ]);
    assert.ok(calls.some((call) => call.join(':') === 'eq:actor_id:actor-a'));
});

test('completed idempotent mutations may have a null result', async () => {
    const core = await importSource(
        'supabase/functions/api/core.ts',
        'const requiredStringArg = (value) => String(value).trim();\n',
    );
    const builder = {
        insert() {
            return Promise.resolve({ error: { code: '23505' } });
        },
        select() {
            return this;
        },
        eq() {
            return this;
        },
        single() {
            return Promise.resolve({ data: { result: null, completed: true }, error: null });
        },
    };
    const value = await core.withLockedDedupe(
        { from: () => builder },
        'request:delete',
        'request-456',
        'actor-a',
        async () => assert.fail('completed duplicate callback must not run'),
    );
    assert.equal(value.duplicate, true);
    assert.equal(value.result, null);
});

test('an incomplete idempotency claim remains retryable', async () => {
    const core = await importSource(
        'supabase/functions/api/core.ts',
        'const requiredStringArg = (value) => String(value).trim();\n',
    );
    const builder = {
        insert() {
            return Promise.resolve({ error: { code: '23505' } });
        },
        select() {
            return this;
        },
        eq() {
            return this;
        },
        single() {
            return Promise.resolve({ data: { result: null, completed: false }, error: null });
        },
    };
    await assert.rejects(
        core.withLockedDedupe(
            { from: () => builder },
            'request:delete',
            'request-789',
            'actor-a',
            async () => assert.fail('in-flight duplicate callback must not run'),
        ),
        /already being processed/,
    );
});

test('idempotency completion is stored separately from the result', async () => {
    const sql = await readFile(
        new URL('supabase/migrations/20261003000000_idempotency_completion.sql', rootUrl),
        'utf8',
    );
    assert.match(sql, /add column completed boolean not null default false/);
    assert.match(sql, /update public\.idempotency_keys set completed = true/);
});

test('security migration closes the direct database authorization gaps', async () => {
    const sql = await readFile(
        new URL('supabase/migrations/20261001000000_security_authorization_hardening.sql', rootUrl),
        'utf8',
    );
    assert.match(sql, /current_user = 'authenticated'/);
    assert.match(sql, /new\.role is distinct from old\.role/);
    assert.match(sql, /new\.email is distinct from old\.email/);
    assert.match(sql, /create policy "admins manage allowed email domains"[\s\S]*is_admin\(\)/);
    assert.match(sql, /create policy "request participants insert comments"/);
    assert.match(sql, /author_name is null/);
    assert.match(sql, /primary key \(actor_id, scope, request_id\)/);
});

test('viewer comments remain blocked through the direct Data API', async () => {
    const sql = await readFile(
        new URL('supabase/migrations/20261003010000_viewer_comments_read_only.sql', rootUrl),
        'utf8',
    );
    assert.match(sql, /current_role\(\) <> 'viewer'/);
    assert.match(sql, /author_id = auth\.uid\(\)/);
});

test('upload and transition migration enforces storage limits and service-only transactions', async () => {
    const sql = await readFile(
        new URL(
            'supabase/migrations/20261001130000_secure_uploads_and_request_actions.sql',
            rootUrl,
        ),
        'utf8',
    );
    assert.match(sql, /file_size_limit = 51200/);
    assert.match(sql, /image\/avif[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/);
    assert.match(sql, /perform_inventory_request_action_tx[\s\S]*for update/);
    assert.match(sql, /perform_program_request_action_tx[\s\S]*for update/);
    assert.match(
        sql,
        /revoke all on function public\.perform_inventory_request_action_tx[\s\S]*from public, anon, authenticated/,
    );
    assert.match(
        sql,
        /revoke all on function public\.perform_program_request_action_tx[\s\S]*from public, anon, authenticated/,
    );
});
