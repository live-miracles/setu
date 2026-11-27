import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeClient, loadBundle } from './test-support.mjs';

const loadReference = () =>
    loadBundle(`export {
        createEmailCcAddress,
        deleteEmailCcAddress,
        listEmailCcAddresses,
    } from './supabase/functions/api/reference';`);

// Minimal stand-in for the service-role client's email_cc_addresses table.
function adminWith(emails = []) {
    const rows = emails.map((email) => ({ email }));
    return {
        rows,
        from(table) {
            assert.equal(table, 'email_cc_addresses');
            return {
                select: (_columns, options) =>
                    options?.head
                        ? Promise.resolve({ count: rows.length, error: null })
                        : { single: () => Promise.resolve({ data: rows.at(-1), error: null }) },
                insert: (row) => {
                    const duplicate = rows.some((existing) => existing.email === row.email);
                    if (!duplicate) rows.push({ email: row.email });
                    return {
                        select: () => ({
                            single: () =>
                                Promise.resolve(
                                    duplicate
                                        ? { data: null, error: { message: 'dup', code: '23505' } }
                                        : { data: { email: row.email }, error: null },
                                ),
                        }),
                    };
                },
                delete: () => ({
                    eq: (_column, value) => {
                        const index = rows.findIndex((row) => row.email === value);
                        if (index >= 0) rows.splice(index, 1);
                        return Promise.resolve({ error: null });
                    },
                }),
            };
        },
    };
}

const asAdmin = () => fakeClient({ profiles: [{ id: 'admin-1', role: 'admin' }] });

test('admins add CC addresses; they are lower-cased and stored once', async () => {
    const { createEmailCcAddress } = await loadReference();
    const admin = adminWith();
    const added = await createEmailCcAddress(asAdmin(), admin, 'admin-1', {
        email: '  Ops@Example.org ',
    });
    assert.deepEqual(added, { email: 'ops@example.org' });
    assert.deepEqual(admin.rows, [{ email: 'ops@example.org' }]);
    await assert.rejects(
        createEmailCcAddress(asAdmin(), admin, 'admin-1', { email: 'ops@example.org' }),
        /already gets a copy/,
    );
});

test('CC addresses must be a single valid address', async () => {
    const { createEmailCcAddress } = await loadReference();
    const admin = adminWith();
    for (const bad of ['', 'not-an-email', 'a@b.org, c@d.org', 'Name <a@b.org>']) {
        await assert.rejects(
            createEmailCcAddress(asAdmin(), admin, 'admin-1', { email: bad }),
            /valid email|required/,
            bad,
        );
    }
    assert.deepEqual(admin.rows, []);
});

test('the CC list is capped so the Cc header stays short', async () => {
    const { createEmailCcAddress } = await loadReference();
    const full = adminWith(Array.from({ length: 20 }, (_, index) => `u${index}@example.org`));
    await assert.rejects(
        createEmailCcAddress(asAdmin(), full, 'admin-1', { email: 'extra@example.org' }),
        /At most 20/,
    );
    assert.equal(full.rows.length, 20);
});

test('only admins can read or change the CC list', async () => {
    const { createEmailCcAddress, deleteEmailCcAddress, listEmailCcAddresses } =
        await loadReference();
    const admin = adminWith(['ops@example.org']);
    for (const role of ['approver', 'user', 'viewer']) {
        const client = fakeClient({ profiles: [{ id: 'u-1', role }] });
        await assert.rejects(listEmailCcAddresses(client, 'u-1'), /Administrator access/, role);
        await assert.rejects(
            createEmailCcAddress(client, admin, 'u-1', { email: 'new@example.org' }),
            /Administrator access/,
            role,
        );
        await assert.rejects(
            deleteEmailCcAddress(client, admin, 'u-1', 'ops@example.org'),
            /Administrator access/,
            role,
        );
    }
    assert.deepEqual(admin.rows, [{ email: 'ops@example.org' }]);
});

test('admins remove a CC address regardless of letter case', async () => {
    const { deleteEmailCcAddress } = await loadReference();
    const admin = adminWith(['ops@example.org', 'lead@example.org']);
    await deleteEmailCcAddress(asAdmin(), admin, 'admin-1', ' OPS@Example.org ');
    assert.deepEqual(admin.rows, [{ email: 'lead@example.org' }]);
});
