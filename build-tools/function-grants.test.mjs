import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);

test('internal SECURITY DEFINER functions are not executable by app roles', async () => {
    const sql = await readFile(
        new URL(
            'supabase/migrations/20261002000000_restrict_internal_function_execute.sql',
            rootUrl,
        ),
        'utf8',
    );
    for (const signature of [
        'claim_comment_email_batch(integer)',
        'delete_inventory_type_with_items(uuid)',
        'enqueue_comment_emails()',
        'run_comment_email_dispatch()',
        'cleanup_stale_operational_rows()',
        'create_overdue_inventory_reminders()',
        'handle_new_user()',
        'protect_profile_security_fields()',
    ]) {
        assert.ok(sql.includes(`public.${signature}`), `${signature} must be restricted`);
    }
    assert.match(sql, /revoke all on function %s from public, anon, authenticated/);
    assert.match(sql, /revoke all on function %s from public, anon'/);
});

test('every SECURITY DEFINER function revokes anon and authenticated explicitly or is covered', async () => {
    // Guards against a new migration adding a definer function that relies on
    // `revoke ... from public` alone (Supabase default privileges still grant
    // anon/authenticated EXECUTE).
    const dir = new URL('supabase/migrations/', rootUrl);
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    const all = (await Promise.all(files.map((name) => readFile(new URL(name, dir), 'utf8')))).join(
        '\n',
    );
    const definers = all
        .split(/create (?:or replace )?function /)
        .slice(1)
        .filter((block) => /security definer/.test(block.split(/\bas \$\$/)[0]))
        .map((block) => /^public\.(\w+)/.exec(block)?.[1])
        .filter(Boolean);
    const handled = new Set([
        // Evaluated as the signed-in role by RLS policies; anon is revoked in
        // 20261002000000_restrict_internal_function_execute.sql.
        'current_role',
        'is_approver',
        'is_admin',
        'can_view_inventory_request',
        'can_view_program_request',
        'inventory_availability',
        // Auth hook, explicitly revoked from app roles when created.
        'restrict_user_by_email_domain',
    ]);
    const restricted = await readFile(
        new URL('20261002000000_restrict_internal_function_execute.sql', dir),
        'utf8',
    );
    for (const name of new Set(definers)) {
        if (handled.has(name)) continue;
        assert.ok(
            restricted.includes(`public.${name}(`) ||
                new RegExp(`revoke[^;]*function public\\.${name}\\([^)]*\\)[^;]*anon`).test(all),
            `${name} is SECURITY DEFINER but not restricted from anon/authenticated`,
        );
    }
});

test('Vercel responses carry baseline security headers and keep camera access', async () => {
    const config = JSON.parse(await readFile(new URL('vercel.json', rootUrl), 'utf8'));
    const headers = Object.fromEntries(
        config.headers
            .find((entry) => entry.source === '/(.*)')
            .headers.map((header) => [header.key, header.value]),
    );
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.match(headers['Permissions-Policy'], /camera=\(self\)/);
});

test('legacy base64 uploads reject oversized or malformed payloads before touching Storage', async () => {
    const source = (await readFile(new URL('supabase/functions/api/images.ts', rootUrl), 'utf8'))
        .replace(/^import .*;\n/gm, '')
        .replace(/^export async function createImageUploadUrl[\s\S]*?\n}\n/m, '');
    const { transform } = await import('esbuild');
    const { code } = await transform(
        `const requireNonEmpty = (value) => String(value).trim();
         const result = (response) => response.data;
         const currentProfile = async () => ({});\n${source}`,
        { loader: 'ts', format: 'esm' },
    );
    const images = await import(
        `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    );
    let storageCalled = false;
    const admin = {
        storage: {
            from: () => {
                storageCalled = true;
                return { upload: async () => ({ error: null }), remove: async () => ({}) };
            },
        },
    };
    await assert.rejects(
        images.uploadImage(admin, 'user-a', 'A'.repeat(200_000), 'a.png', 'image/png', ''),
        /too large/,
    );
    await assert.rejects(
        images.uploadImage(admin, 'user-a', '***not base64***', 'a.png', 'image/png', ''),
        /not valid image data/,
    );
    assert.equal(storageCalled, false);
    assert.match(
        await images.uploadImage(admin, 'user-a', 'eA==', 'a.png', 'image/png', ''),
        /^user-a\/.+\.png$/,
    );
});
