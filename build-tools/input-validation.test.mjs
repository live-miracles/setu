import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
import { fakeClient, loadBundle } from './test-support.mjs';

const rootUrl = new URL('../', import.meta.url);

async function load(path, { prelude = '', from, to } = {}) {
    let source = (await readFile(new URL(path, rootUrl), 'utf8')).replace(/^import [^;]*;\n/gm, '');
    if (from) source = source.slice(source.indexOf(from));
    if (to) source = source.slice(0, source.indexOf(to));
    const { code } = await transform(prelude + source, { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const validationPrelude = `const requiredStringArg = (value, message) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new Error(message);
    return text;
};\n`;

test('email validation accepts one address and rejects multi-recipient or malformed values', async () => {
    const validation = await loadBundle(`export * from './supabase/functions/api/validation';`);
    assert.equal(validation.emailArg('  Lead@Example.org ', 'required'), 'lead@example.org');
    for (const bad of [
        'a@b.org,c@d.org',
        'a@b.org;c@d.org',
        'Name <a@b.org>',
        'no-at-sign.org',
        'a@b',
        'a b@c.org',
        'a@b.org\nBcc: x@y.org',
        `${'a'.repeat(250)}@b.org`,
    ]) {
        assert.throws(() => validation.emailArg(bad, 'required'), /valid email/, bad);
    }
    assert.throws(() => validation.emailArg('   ', 'Lead email is required.'), /required/);
});

test('program status changes must use a workflow action', async () => {
    const validation = await loadBundle(`export * from './supabase/functions/api/validation';`);
    assert.doesNotThrow(() => validation.requireUnchangedWorkflowStatus(undefined, 'submitted'));
    assert.doesNotThrow(() => validation.requireUnchangedWorkflowStatus('submitted', 'submitted'));
    assert.throws(
        () => validation.requireUnchangedWorkflowStatus('approved', 'submitted'),
        /workflow action/,
    );
});

test('participant lists are validated, de-duplicated and capped', async () => {
    const inventory = await loadBundle(
        `export { parseParticipants } from './supabase/functions/api/requests';`,
    );
    assert.deepEqual(inventory.parseParticipants(' A@x.org, a@x.org ,b@y.org,'), [
        'a@x.org',
        'b@y.org',
    ]);
    assert.deepEqual(inventory.parseParticipants(''), []);
    assert.throws(() => inventory.parseParticipants('ok@x.org, not-an-email'), /valid participant/);
    const many = Array.from({ length: 51 }, (_, index) => `u${index}@x.org`).join(',');
    assert.throws(() => inventory.parseParticipants(many), /at most 50/);
});

function deleteUserFixture({ counts = [0, 0, 0, 0], actorId = 'admin-1' } = {}) {
    const deleted = [];
    const countTables = ['inventory_requests', 'program_requests', 'rosters', 'comments'];
    const admin = {
        from(table) {
            if (table === 'profiles') {
                return {
                    select: () => ({
                        eq: () => ({
                            single: async () => ({ data: { id: 'target-1' }, error: null }),
                        }),
                    }),
                };
            }
            const index = countTables.indexOf(table);
            return {
                select: () => ({
                    eq: async () => ({ count: counts[index], error: null }),
                }),
            };
        },
        auth: {
            admin: {
                deleteUser: async (id) => {
                    deleted.push(id);
                    return { error: null };
                },
            },
        },
    };
    return { admin, deleted, actorId };
}

async function loadDeleteUser(actorId) {
    return load('supabase/functions/api/settings.ts', {
        prelude: `const requireAdmin = async () => ({ id: ${JSON.stringify(actorId)} });
            const requireApprover = requireAdmin;
            const requireNonEmpty = (value) => String(value).trim();
            const result = (response) => response.data;
            const userDto = (value) => value;
            const withLockedDedupe = async (_admin, _scope, _requestId, _actor, fn) => ({
                duplicate: false,
                result: await fn(),
            });\n`,
    });
}

test('deleting a user is refused for the caller and for users with history', async () => {
    const own = deleteUserFixture();
    const settingsSelf = await loadDeleteUser('target-1');
    await assert.rejects(
        settingsSelf.deleteUser({}, own.admin, 'target-1', 'me@example.org', 'request-1'),
        /own account/,
    );
    assert.deepEqual(own.deleted, []);

    const settings = await loadDeleteUser('admin-1');
    for (const counts of [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 3],
    ]) {
        const withHistory = deleteUserFixture({ counts });
        await assert.rejects(
            settings.deleteUser({}, withHistory.admin, 'admin-1', 'x@example.org', 'request-1'),
            /cannot be deleted/,
        );
        assert.deepEqual(withHistory.deleted, []);
    }

    const clean = deleteUserFixture();
    await settings.deleteUser({}, clean.admin, 'admin-1', 'x@example.org', 'request-1');
    assert.deepEqual(clean.deleted, ['target-1']);
});

test('comment length limit is enforced before any request lookup', async () => {
    const comments = await loadBundle(
        `export { addComment } from './supabase/functions/api/comments';`,
    );
    const client = fakeClient({ profiles: [{ id: 'user-1', role: 'user' }] });
    const admin = {
        from() {
            throw new Error('request lookup must not run for an oversized comment');
        },
    };
    await assert.rejects(
        comments.addComment(client, admin, 'user-1', 'request-1', 'x'.repeat(4001), 'dedupe-123'),
        /at most 4000/,
    );
});
