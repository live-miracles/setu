// Isolated PostgreSQL authorization regression check. It uses fictional rows
// and never connects to a hosted Supabase project.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asUser = async (id) => {
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}'`);
};

try {
    await db.exec(`
        create role authenticated;
        create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql stable
          as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

        create table public.profiles (
          id uuid primary key,
          email text not null unique,
          name text not null default '',
          role text not null default 'user'
        );
        alter table public.profiles enable row level security;
        create policy "users read own profile" on public.profiles for select to authenticated
          using (id = auth.uid());
        create policy "users update own profile" on public.profiles for update to authenticated
          using (id = auth.uid()) with check (id = auth.uid());

        create function public.is_admin() returns boolean language sql stable security definer
          set search_path = public as $$ select role = 'admin' from profiles where id = auth.uid() $$;
        create function public.is_approver() returns boolean language sql stable security definer
          set search_path = public as $$ select role in ('admin', 'approver') from profiles where id = auth.uid() $$;

        create table public.allowed_email_domains (domain text primary key);
        alter table public.allowed_email_domains enable row level security;
        create policy "approvers manage allowed email domains" on public.allowed_email_domains
          for all to authenticated using (public.is_approver()) with check (public.is_approver());

        create table public.inventory_requests (id uuid primary key, requester_id uuid not null);
        create table public.program_requests (id uuid primary key, requester_id uuid not null);
        create table public.inventory_request_participants (request_id uuid, profile_id uuid);
        create table public.program_request_participants (request_id uuid, profile_id uuid);
        create table public.comments (
          id uuid primary key,
          inventory_request_id uuid,
          program_request_id uuid,
          author_id uuid,
          author_name text,
          message text not null
        );
        alter table public.comments enable row level security;
        create policy "users insert visible comments" on public.comments for insert to authenticated
          with check (author_id = auth.uid());

        create table public.idempotency_keys (
          scope text not null,
          request_id text not null,
          result jsonb,
          created_at timestamptz not null default now(),
          primary key (scope, request_id)
        );
        alter table public.idempotency_keys enable row level security;

        grant usage on schema public, auth to authenticated, service_role;
        grant execute on function auth.uid() to authenticated, service_role;
        grant select, update on public.profiles to authenticated;
        grant select, insert, update, delete on public.allowed_email_domains to authenticated;
        grant select on public.inventory_requests, public.program_requests,
          public.inventory_request_participants, public.program_request_participants to authenticated;
        grant insert on public.comments to authenticated;
        grant all on all tables in schema public to service_role;
    `);

    for (const [n, role] of [
        [1, 'user'],
        [2, 'viewer'],
        [3, 'approver'],
        [4, 'admin'],
        [5, 'user'],
    ]) {
        await db.query('insert into profiles (id, email, name, role) values ($1, $2, $3, $4)', [
            uuid(n),
            `user${n}@example.test`,
            `User ${n}`,
            role,
        ]);
    }
    await db.query('insert into inventory_requests values ($1, $2)', [uuid(10), uuid(1)]);
    await db.query('insert into program_requests values ($1, $2)', [uuid(11), uuid(5)]);
    await db.query('insert into program_request_participants values ($1, $2)', [uuid(11), uuid(1)]);

    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261001000000_security_authorization_hardening.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    await asUser(uuid(1));
    assert.deepEqual((await db.query('select auth.uid() as id, current_user as role')).rows[0], {
        id: uuid(1),
        role: 'authenticated',
    });
    await assert.rejects(
        db.query("update profiles set role = 'admin' where id = $1", [uuid(1)]),
        /only be changed by an administrator/i,
    );
    await assert.rejects(
        db.query("update profiles set email = 'changed@example.test' where id = $1", [uuid(1)]),
        /only be changed by an administrator/i,
    );
    await db.query("update profiles set name = 'Updated' where id = $1", [uuid(1)]);

    await asUser(uuid(3));
    await assert.rejects(
        db.query("insert into allowed_email_domains values ('approver.example')"),
        /row-level security/i,
    );
    await asUser(uuid(4));
    await db.query("insert into allowed_email_domains values ('admin.example')");

    await asUser(uuid(2));
    await assert.rejects(
        db.query('insert into comments values ($1, $2, null, $3, null, $4)', [
            uuid(20),
            uuid(10),
            uuid(2),
            'Viewer bypass',
        ]),
        /row-level security/i,
    );
    await asUser(uuid(1));
    await db.query('insert into comments values ($1, $2, null, $3, null, $4)', [
        uuid(21),
        uuid(10),
        uuid(1),
        'Requester comment',
    ]);
    await db.query('insert into comments values ($1, null, $2, $3, null, $4)', [
        uuid(22),
        uuid(11),
        uuid(1),
        'Participant comment',
    ]);
    await assert.rejects(
        db.query('insert into comments values ($1, $2, null, $3, $4, $5)', [
            uuid(23),
            uuid(10),
            uuid(1),
            'Spoofed author',
            'Spoof attempt',
        ]),
        /row-level security/i,
    );
    await asUser(uuid(3));
    await db.query('insert into comments values ($1, $2, null, $3, null, $4)', [
        uuid(24),
        uuid(10),
        uuid(3),
        'Approver comment',
    ]);

    await db.exec('reset role; set role service_role');
    await db.query("update profiles set role = 'viewer' where id = $1", [uuid(1)]);
    await db.query(
        'insert into idempotency_keys (actor_id, scope, request_id) values ($1, $2, $3)',
        [uuid(1), 'request:create', 'same-request-id'],
    );
    await db.query(
        'insert into idempotency_keys (actor_id, scope, request_id) values ($1, $2, $3)',
        [uuid(2), 'request:create', 'same-request-id'],
    );
    await assert.rejects(
        db.query('insert into idempotency_keys (actor_id, scope, request_id) values ($1, $2, $3)', [
            uuid(1),
            'request:create',
            'same-request-id',
        ]),
        /duplicate key/i,
    );

    console.log(
        'profile fields, admin-only domains, comment roles, author identity and actor-scoped idempotency passed',
    );
} finally {
    await db.close();
}
