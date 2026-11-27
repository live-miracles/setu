import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
import { fakeClient, loadBundle } from './test-support.mjs';

const rootUrl = new URL('../', import.meta.url);

async function importSource(path, prelude = '') {
    const source = (await readFile(new URL(path, rootUrl), 'utf8')).replace(
        /^import[\s\S]*?;\r?\n/gm,
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
    const images = await loadBundle(
        `export { createImageUploadUrl } from './supabase/functions/api/images';`,
    );
    const rows = {
        inventory_types: [{ id: 'type-1' }],
        inventory_requests: [{ id: 'request-1', requester_id: 'owner-1', status: 'draft' }],
        inventory_request_participants: [{ request_id: 'request-1', profile_id: 'participant-1' }],
    };
    const asUser = (profile) => fakeClient({ profiles: [profile] });
    const signedPaths = [];
    const admin = {
        ...fakeClient(rows),
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
            asUser({ id: 'unrelated-1', role: 'user' }),
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
        asUser({ id: 'participant-1', role: 'user' }),
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
            asUser({ id: 'approver-1', role: 'approver' }),
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
        asUser({ id: 'admin-1', role: 'admin' }),
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
    const comments = await loadBundle(
        `export { addComment } from './supabase/functions/api/comments';`,
    );
    const viewerClient = fakeClient({ profiles: [{ id: 'viewer-1', role: 'viewer' }] });
    await assert.rejects(
        comments.addComment(viewerClient, {}, 'viewer-1', 'request-1', 'hello'),
        /read-only/,
    );
});

const CLIENT_COMMENT_ID = '3f1c2a9e-7b64-4d0a-9c1e-5a2b8d4e6f70';

// The user-scoped client inserts the comment (RLS applies); `insertError`
// makes that insert fail the way a primary-key replay does.
function commentFixture({ insertError = null, existing = [] } = {}) {
    const inserted = [];
    const tables = fakeClient({
        profiles: [
            { id: 'user-1', role: 'user', email: 'one@example.org', name: 'One' },
            { id: 'user-2', role: 'user', email: 'two@example.org', name: 'Two' },
        ],
        comments: existing,
    });
    const client = {
        from(table) {
            if (table !== 'comments') return tables.from(table);
            return {
                insert(row) {
                    inserted.push(row);
                    return {
                        select: () => ({
                            single: async () =>
                                insertError
                                    ? { data: null, error: insertError }
                                    : { data: { ...row, created_at: 'now' }, error: null },
                        }),
                    };
                },
                select: () => tables.from('comments').select('*'),
            };
        },
    };
    const admin = fakeClient({
        inventory_requests: [{ id: 'request-1', requester_id: 'user-1' }],
        inventory_request_participants: [],
        program_requests: [],
        program_request_participants: [],
    });
    return { client, admin, inserted };
}

async function loadComments() {
    return loadBundle(`export { addComment } from './supabase/functions/api/comments';`);
}

test('a comment is stored under the id the client chose, or a generated one', async () => {
    const comments = await loadComments();
    const chosen = commentFixture();
    const comment = await comments.addComment(
        chosen.client,
        chosen.admin,
        'user-1',
        'request-1',
        ' hello ',
        CLIENT_COMMENT_ID,
    );
    assert.equal(chosen.inserted[0].id, CLIENT_COMMENT_ID);
    assert.equal(chosen.inserted[0].author_id, 'user-1');
    assert.equal(chosen.inserted[0].message, 'hello');
    assert.equal(comment.Id, CLIENT_COMMENT_ID);

    const generated = commentFixture();
    for (const clientId of ['not-a-uuid', '', undefined]) {
        await comments.addComment(
            generated.client,
            generated.admin,
            'user-1',
            'request-1',
            'hello',
            clientId,
        );
    }
    const ids = generated.inserted.map((row) => row.id);
    assert.equal(new Set(ids).size, 3, 'each unusable client id gets its own fresh id');
    for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
    assert.ok(!ids.includes('not-a-uuid'));
});

test('replaying a comment submit returns the existing comment for its author only', async () => {
    const comments = await loadComments();
    const existing = [
        {
            id: CLIENT_COMMENT_ID,
            inventory_request_id: 'request-1',
            author_id: 'user-1',
            message: 'hello',
            created_at: 'earlier',
        },
    ];
    const replay = commentFixture({
        insertError: { code: '23505', message: 'duplicate' },
        existing,
    });
    const comment = await comments.addComment(
        replay.client,
        replay.admin,
        'user-1',
        'request-1',
        'hello',
        CLIENT_COMMENT_ID,
    );
    assert.equal(comment.Id, CLIENT_COMMENT_ID);
    assert.equal(comment.Timestamp, 'earlier', 'the first comment is returned, not a new one');

    // Another user cannot claim or read a comment through an id they do not own.
    const foreign = commentFixture({
        insertError: { code: '23505', message: 'duplicate' },
        existing,
    });
    foreign.admin = fakeClient({
        inventory_requests: [{ id: 'request-1', requester_id: 'user-2' }],
        inventory_request_participants: [],
    });
    await assert.rejects(
        comments.addComment(
            foreign.client,
            foreign.admin,
            'user-2',
            'request-1',
            'hi',
            CLIENT_COMMENT_ID,
        ),
        /already in use/,
    );

    // Any other insert failure is reported, not mistaken for a replay.
    const failing = commentFixture({ insertError: { code: '42501', message: 'denied by policy' } });
    await assert.rejects(
        comments.addComment(failing.client, failing.admin, 'user-1', 'request-1', 'hi'),
        /denied by policy/,
    );
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

test('comments stored through the Data API have a length limit', async () => {
    const sql = await readFile(
        new URL('supabase/migrations/20261125000000_comment_length_limit.sql', rootUrl),
        'utf8',
    );
    assert.match(sql, /add constraint comments_message_length check \(length\(message\) <= 5000\)/);
});

test('the roster is readable by staff roles only through the Data API', async () => {
    const sql = await readFile(
        new URL('supabase/migrations/20261125010000_roster_staff_only.sql', rootUrl),
        'utf8',
    );
    assert.match(sql, /drop policy if exists "authenticated users read rosters"/);
    assert.match(sql, /create policy "staff read rosters"[\s\S]*current_role\(\) <> 'user'/);
});

test('browser sign-in uses the PKCE flow so no token travels in the redirect URL', async () => {
    const source = await readFile(new URL('frontend/src/supabase.ts', rootUrl), 'utf8');
    assert.match(source, /auth:\s*\{\s*flowType:\s*'pkce'\s*\}/);
});

test('the Content-Security-Policy allows exactly the inline theme script in shell.html', async () => {
    const { createHash } = await import('node:crypto');
    const html = await readFile(new URL('frontend/shell.html', rootUrl), 'utf8');
    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(inlineScripts.length, 1, 'shell.html should keep a single inline script');
    const hash = `sha256-${createHash('sha256').update(inlineScripts[0][1]).digest('base64')}`;
    const config = JSON.parse(await readFile(new URL('vercel.json', rootUrl), 'utf8'));
    const policy = config.headers
        .flatMap((entry) => entry.headers)
        .find((header) => header.key === 'Content-Security-Policy').value;
    assert.ok(policy.includes(`'${hash}'`), 'update the script hash in vercel.json');
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-eval'/);
});
