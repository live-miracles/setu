// Isolated PostgreSQL check for the function-execute migration; does not
// connect to hosted data. Install @electric-sql/pglite in a temporary
// directory, then run:
// node build-tools/function-grants-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();

const canExecute = async (role, signature) =>
    (
        await db.query(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [
            role,
            signature,
        ])
    ).rows[0].ok;

try {
    // Mirror Supabase: default privileges grant EXECUTE on new functions to the
    // API roles, which `revoke ... from public` does not undo.
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create role supabase_auth_admin;
        alter default privileges in schema public grant execute on functions
          to anon, authenticated, service_role;
        create function public.claim_comment_email_batch(batch_size integer)
          returns void language sql security definer as $$ select $$;
        revoke all on function public.claim_comment_email_batch(integer) from public;
        create function public.delete_inventory_type_with_items(target uuid)
          returns void language sql security definer as $$ select $$;
        create function public.is_email_domain_allowed(candidate_email text)
          returns boolean language sql security definer as $$ select true $$;
        create function public.is_approver()
          returns boolean language sql security definer as $$ select true $$;
        create function public.inventory_availability()
          returns integer language sql security definer as $$ select 1 $$;
    `);
    assert.equal(
        await canExecute('authenticated', 'public.claim_comment_email_batch(integer)'),
        true,
    );

    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261002020000_restrict_internal_function_execute.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    for (const signature of [
        'public.claim_comment_email_batch(integer)',
        'public.delete_inventory_type_with_items(uuid)',
        'public.is_email_domain_allowed(text)',
    ]) {
        assert.equal(await canExecute('anon', signature), false, `anon ${signature}`);
        assert.equal(await canExecute('authenticated', signature), false, `auth ${signature}`);
        assert.equal(await canExecute('service_role', signature), true, `service ${signature}`);
    }
    assert.equal(
        await canExecute('supabase_auth_admin', 'public.is_email_domain_allowed(text)'),
        true,
    );

    for (const signature of ['public.is_approver()', 'public.inventory_availability()']) {
        assert.equal(await canExecute('anon', signature), false, `anon ${signature}`);
        assert.equal(await canExecute('authenticated', signature), true, `auth ${signature}`);
    }
    console.log('function grant checks passed');
} finally {
    await db.close();
}
