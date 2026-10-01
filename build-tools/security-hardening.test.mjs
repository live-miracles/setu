import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const rootUrl = new URL('../', import.meta.url);

async function importSource(path, prelude = '') {
    const source = (await readFile(new URL(path, rootUrl), 'utf8')).replace(/^import .*;\n/gm, '');
    const { code } = await transform(prelude + source, { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('image replacement rejects paths outside the current user folder', async () => {
    const images = await importSource(
        'supabase/functions/api/images.ts',
        'const requireNonEmpty = (value) => String(value).trim();\n',
    );
    assert.equal(images.isOwnedImagePath('user-a', 'user-a/photo.png'), true);
    assert.equal(images.isOwnedImagePath('user-a', 'user-b/photo.png'), false);
    assert.equal(images.isOwnedImagePath('user-a', 'user-a/../user-b/photo.png'), false);

    let storageCalled = false;
    const admin = {
        storage: {
            from: () => {
                storageCalled = true;
                return {};
            },
        },
    };
    await assert.rejects(
        images.uploadImage(admin, 'user-a', 'eA==', 'photo.png', 'image/png', 'user-b/photo.png'),
        /another user/,
    );
    assert.equal(storageCalled, false);
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
            return Promise.resolve({ data: { result: { ok: true } }, error: null });
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
