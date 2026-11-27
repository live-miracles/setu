import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
import { fakeClient, loadBundle } from './test-support.mjs';

const rootUrl = new URL('../', import.meta.url);

async function load(path, { prelude = '', from, to } = {}) {
    let source = (await readFile(new URL(path, rootUrl), 'utf8')).replace(
        /^import [^;]*;\r?\n/gm,
        '',
    );
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
            const userDto = (value) => value;\n`,
    });
}

test('deleting a user is refused for the caller and for users with history', async () => {
    const own = deleteUserFixture();
    const settingsSelf = await loadDeleteUser('target-1');
    await assert.rejects(
        settingsSelf.deleteUser({}, own.admin, 'target-1', 'me@example.org'),
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
            settings.deleteUser({}, withHistory.admin, 'admin-1', 'x@example.org'),
            /cannot be deleted/,
        );
        assert.deepEqual(withHistory.deleted, []);
    }

    const clean = deleteUserFixture();
    await settings.deleteUser({}, clean.admin, 'admin-1', 'x@example.org');
    assert.deepEqual(clean.deleted, ['target-1']);
});

async function loadMemberSettings() {
    return load('supabase/functions/api/settings.ts', {
        prelude: `const requireAdmin = async () => ({ id: 'admin-1', email: 'admin@example.org' });
            const requireNonEmpty = (value, message) => {
                const text = String(value ?? '').trim();
                if (!text) throw new Error(message);
                return text;
            };
            const emailArg = (value, message) => requireNonEmpty(value, message).toLowerCase();
            const boundedText = (value) => String(value ?? '').trim();
            const MAX_NAME_LENGTH = 200;
            const MAX_PHONE_LENGTH = 50;
            const result = (response) => {
                if (response.error) throw new Error(response.error.message);
                return response.data;
            };
            const userDto = (profile) => ({
                Email: profile.email,
                Role: profile.role,
                SignInBlocked: Boolean(profile.sign_in_blocked),
            });
            const emailDomainAllowed = async (admin, email) =>
                Boolean((await admin.rpc('is_email_domain_allowed', { candidate_email: email })).data);\n`,
    });
}

// A fake service-role client that records what a member change does to the
// auth identity and to the profile.
function memberFixture({
    existing = null,
    target = null,
    domainAllowed = true,
    profileSaveFails = false,
} = {}) {
    const calls = { created: [], authUpdates: [], deleted: [], profileUpdates: [] };
    const admin = {
        rpc: async () => ({ data: domainAllowed, error: null }),
        from(table) {
            if (table === 'departments') {
                return {
                    select: () => ({
                        eq: () => ({ maybeSingle: async () => ({ data: { id: 'dept-1' } }) }),
                        then: (resolve) => resolve({ data: [], error: null }),
                    }),
                };
            }
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: existing, error: null }),
                        single: async () => ({ data: target, error: null }),
                    }),
                }),
                update: (values) => {
                    calls.profileUpdates.push(values);
                    return {
                        eq: () => ({
                            select: () => ({
                                single: async () =>
                                    profileSaveFails
                                        ? { data: null, error: { message: 'profile save failed' } }
                                        : {
                                              data: { id: 'new-1', ...(target || {}), ...values },
                                              error: null,
                                          },
                            }),
                        }),
                    };
                },
            };
        },
        auth: {
            admin: {
                createUser: async (attributes) => {
                    calls.created.push(attributes);
                    return { data: { user: { id: 'new-1' } }, error: null };
                },
                updateUserById: async (id, attributes) => {
                    calls.authUpdates.push([id, attributes]);
                    return { data: {}, error: null };
                },
                deleteUser: async (id) => {
                    calls.deleted.push(id);
                    return { error: null };
                },
            },
        },
    };
    return { admin, calls };
}

test('an administrator can add a member who cannot sign in yet', async () => {
    const settings = await loadMemberSettings();
    const { admin, calls } = memberFixture();
    const member = await settings.createUser({}, admin, 'admin-1', {
        email: ' Sam@Gmail.Example ',
        name: 'Sam',
        role: 'approver',
        departmentId: 'dept-1',
    });
    assert.equal(calls.created.length, 1);
    assert.equal(calls.created[0].email, 'sam@gmail.example');
    assert.equal(calls.created[0].email_confirm, true);
    assert.match(calls.created[0].ban_duration, /^\d+h$/);
    assert.equal(calls.created[0].user_metadata.full_name, 'Sam');
    assert.equal(calls.profileUpdates[0].sign_in_blocked, true);
    assert.equal(calls.profileUpdates[0].role, 'approver');
    assert.equal(member.SignInBlocked, true);
    assert.deepEqual(calls.deleted, []);
});

test('adding a member rejects a duplicate email or unknown role before touching auth', async () => {
    const settings = await loadMemberSettings();
    const duplicate = memberFixture({ existing: { id: 'someone' } });
    await assert.rejects(
        settings.createUser({}, duplicate.admin, 'admin-1', { email: 'a@b.org', name: 'A' }),
        /already exists/,
    );
    const badRole = memberFixture();
    await assert.rejects(
        settings.createUser({}, badRole.admin, 'admin-1', {
            email: 'a@b.org',
            name: 'A',
            role: 'owner',
        }),
        /Unknown role/,
    );
    await assert.rejects(
        settings.createUser({}, badRole.admin, 'admin-1', { email: 'a@b.org', name: ' ' }),
        /Name is required/,
    );
    assert.deepEqual([...duplicate.calls.created, ...badRole.calls.created], []);
});

test('a member whose profile cannot be completed does not keep a banned identity', async () => {
    const settings = await loadMemberSettings();
    const { admin, calls } = memberFixture({ profileSaveFails: true });
    await assert.rejects(
        settings.createUser({}, admin, 'admin-1', { email: 'a@b.org', name: 'A' }),
        /profile save failed/,
    );
    assert.deepEqual(calls.deleted, ['new-1']);
});

test('setting a work email lifts the sign-in block only for an allowed domain', async () => {
    const settings = await loadMemberSettings();
    const blocked = {
        id: 'target-1',
        email: 'sam@gmail.example',
        role: 'approver',
        sign_in_blocked: true,
    };

    const allowed = memberFixture({ target: blocked, domainAllowed: true });
    const unblocked = await settings.updateUser(
        allowed.admin,
        allowed.admin,
        'admin-1',
        blocked.email,
        {
            email: 'Sam@Org.Example',
        },
    );
    assert.deepEqual(allowed.calls.authUpdates, [
        ['target-1', { email: 'sam@org.example', email_confirm: true, ban_duration: 'none' }],
    ]);
    assert.equal(allowed.calls.profileUpdates[0].email, 'sam@org.example');
    assert.equal(allowed.calls.profileUpdates[0].sign_in_blocked, false);
    assert.equal(unblocked.SignInBlocked, false);

    const notAllowed = memberFixture({ target: blocked, domainAllowed: false });
    const stillBlocked = await settings.updateUser(
        notAllowed.admin,
        notAllowed.admin,
        'admin-1',
        blocked.email,
        {
            email: 'sam@other.example',
        },
    );
    assert.equal('ban_duration' in notAllowed.calls.authUpdates[0][1], false);
    assert.equal(stillBlocked.SignInBlocked, true);
});

test('the email of a member who can sign in cannot be changed', async () => {
    const settings = await loadMemberSettings();
    const active = {
        id: 'target-2',
        email: 'kim@org.example',
        role: 'user',
        sign_in_blocked: false,
    };
    const { admin, calls } = memberFixture({ target: active });
    await assert.rejects(
        settings.updateUser({}, admin, 'admin-1', active.email, { email: 'kim@new.example' }),
        /has not signed in yet/,
    );
    assert.deepEqual(calls.authUpdates, []);
    assert.deepEqual(calls.profileUpdates, []);
    // Sending the unchanged email alongside other edits is fine.
    await settings.updateUser(admin, admin, 'admin-1', active.email, {
        email: active.email,
        name: 'Kim',
    });
    assert.deepEqual(calls.authUpdates, []);
});

test('a failed profile save puts the previous email back on the identity', async () => {
    const settings = await loadMemberSettings();
    const blocked = {
        id: 'target-1',
        email: 'sam@gmail.example',
        role: 'approver',
        sign_in_blocked: true,
    };
    const { admin, calls } = memberFixture({ target: blocked, profileSaveFails: true });
    await assert.rejects(
        settings.updateUser({}, admin, 'admin-1', blocked.email, { email: 'sam@org.example' }),
        /profile save failed/,
    );
    assert.equal(calls.authUpdates.length, 2);
    assert.equal(calls.authUpdates[1][1].email, 'sam@gmail.example');
    assert.match(calls.authUpdates[1][1].ban_duration, /^\d+h$/);
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
        comments.addComment(client, admin, 'user-1', 'request-1', 'x'.repeat(4001)),
        /at most 4000/,
    );
});

test('an image id must be a plain storage path', async () => {
    const validation = await loadBundle(`export * from './supabase/functions/api/validation';`);
    const path =
        '00000000-0000-4000-8000-000000000001/inventory_request/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.webp';
    assert.equal(validation.imagePathArg(path), path);
    assert.equal(validation.imagePathArg(`  ${path} `), path);
    assert.equal(validation.imagePathArg(''), '');
    assert.equal(validation.imagePathArg(undefined), '');
    for (const bad of [
        '../auth/v1/user',
        'a/../b.png',
        '/leading.png',
        'https://elsewhere.example/x.png',
        'a/b.png?x=1',
        'a/b.png#frag',
        'a/%2e%2e/b.png',
        'a\b.png',
        `${'a'.repeat(301)}.png`,
    ]) {
        assert.throws(() => validation.imagePathArg(bad), /image is not valid/, bad);
    }
});

test('an action note has the comment length cap before the transition runs', async () => {
    const requests = await loadBundle(
        `export { performRequestAction } from './supabase/functions/api/requests';`,
    );
    const client = fakeClient({ profiles: [{ id: 'user-1', role: 'approver' }] });
    const admin = {
        rpc() {
            throw new Error('the transition must not run for an oversized note');
        },
    };
    await assert.rejects(
        requests.performRequestAction(
            { actionRpc: 'perform_inventory_request_action_tx' },
            client,
            admin,
            'user-1',
            'request-1',
            'approve',
            'x'.repeat(4001),
        ),
        /at most 4000/,
    );
});
