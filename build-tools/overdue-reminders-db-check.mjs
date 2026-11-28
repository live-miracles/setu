// Isolated PostgreSQL check for the overdue inventory reminder emails (timing,
// one a day, recipients and content); does not connect to hosted data. Runs as
// part of `npm test` (db-checks.test.mjs); to run it alone:
// node build-tools/overdue-reminders-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
    // Only the columns the reminder function reads and writes.
    await db.exec(`
        create role anon; create role authenticated;
        create domain public.citext as text;
        create table public.profiles (id uuid primary key, email citext not null);
        create table public.inventory_requests (
          id uuid primary key, display_id bigint generated always as identity,
          name text not null default 'Shoot', requester_id uuid not null,
          status text not null, start_date date not null default date '2025-10-01',
          end_date date not null
        );
        create table public.inventory_types (
          id uuid primary key, brand text not null default '', name text not null, model text not null default ''
        );
        create table public.inventory_request_items (
          request_id uuid not null, inventory_type_id uuid not null, quantity integer not null
        );
        create table public.inventory_request_participants (
          request_id uuid not null, profile_id uuid, external_email citext
        );
        create table public.comments (id uuid primary key default gen_random_uuid());
        create table public.email_outbox (
          id uuid primary key default gen_random_uuid(),
          idempotency_key text not null unique, template text not null,
          recipient citext not null, payload jsonb not null default '{}'::jsonb,
          status text not null default 'pending', provider_thread_id text, sent_at timestamptz
        );
        create index email_outbox_comment_thread_idx on public.email_outbox ((payload ->> 'targetId'), sent_at);
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261202020000_overdue_reminders_as_emails.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    await db.exec(`
        insert into public.profiles values
          ('${uuid(1)}', 'borrower@example.org'), ('${uuid(2)}', 'helper@example.org');
        insert into public.inventory_requests (id, requester_id, status, end_date) values
          ('${uuid(11)}', '${uuid(1)}', 'issued', current_date),
          ('${uuid(12)}', '${uuid(1)}', 'issued', current_date - 1),
          ('${uuid(13)}', '${uuid(1)}', 'issued', current_date - 2),
          ('${uuid(14)}', '${uuid(1)}', 'closed', current_date - 5),
          ('${uuid(15)}', '${uuid(1)}', 'issued', date '2020-01-01');
        insert into public.inventory_types values ('${uuid(21)}', 'Sony', 'Camera', 'A7');
        insert into public.inventory_request_items values ('${uuid(13)}', '${uuid(21)}', 2);
        insert into public.inventory_request_participants values
          ('${uuid(13)}', '${uuid(2)}', null),
          ('${uuid(13)}', null, 'guest@example.org'),
          ('${uuid(13)}', '${uuid(1)}', null);
    `);

    const remindedIds = async () =>
        (
            await db.query(
                `select payload->>'targetId' as id from public.email_outbox order by 1, idempotency_key`,
            )
        ).rows.map((row) => row.id);

    await db.query('select public.create_overdue_inventory_reminders()');
    assert.deepEqual(
        await remindedIds(),
        [uuid(13), uuid(15)],
        'reminders start two days after the due date; the day after it is still a grace day',
    );
    assert.equal(
        Number((await db.query('select count(*) as n from public.comments')).rows[0].n),
        0,
        'a reminder is an email, not a comment',
    );

    await db.query('select public.create_overdue_inventory_reminders()');
    assert.deepEqual(
        await remindedIds(),
        [uuid(13), uuid(15)],
        'running again the same day does not send a second reminder',
    );

    // The email reads like the old reminder comment and reaches the same people.
    const { rows } = await db.query(
        `select template, recipient, payload from public.email_outbox where payload->>'targetId' = $1`,
        [uuid(13)],
    );
    const [email] = rows;
    assert.equal(email.template, 'overdue_reminder');
    assert.equal(email.recipient, 'borrower@example.org');
    assert.deepEqual(email.payload.cc, ['guest@example.org', 'helper@example.org']);
    assert.equal(email.payload.targetType, 'inventory_request');
    assert.equal(email.payload.authorName, 'Setu Bot');
    assert.equal(email.payload.kind, 'reminder');
    assert.equal(email.payload.requestPath, `/inventory/${uuid(13)}`);
    assert.match(email.payload.requestSerial, /^REQ-\d+$/);
    assert.equal(email.payload.requestTitle, 'Shoot');
    assert.equal(email.payload.requestMonthYear, 'Oct 2025');
    assert.deepEqual(email.payload.items, [{ name: 'Sony · Camera · A7', quantity: 2 }]);
    assert.match(
        email.payload.message,
        /^This is a reminder that the equipment you borrowed was due to be returned on \d{1,2} [A-Z][a-z]{2} \d{4}\. /,
        'the due date is written as day, short English month name and year',
    );
    const noCc = (
        await db.query(
            `select payload->'cc' as cc from public.email_outbox where payload->>'targetId' = $1`,
            [uuid(15)],
        )
    ).rows[0].cc;
    assert.deepEqual(noCc, [], 'a request without participants copies no one');

    // The following day the same requests are reminded again, and the one that
    // was on its grace day now gets its first reminder.
    await db.exec(`
        update public.email_outbox
           set idempotency_key = replace(idempotency_key, current_date::text, (current_date - 1)::text);
        update public.inventory_requests set end_date = end_date - 1;
    `);
    await db.query('select public.create_overdue_inventory_reminders()');
    assert.deepEqual(
        await remindedIds(),
        [uuid(12), uuid(13), uuid(13), uuid(15), uuid(15)],
        'reminders repeat every day once they have started',
    );

    console.log('overdue reminder SQL checks passed');
} finally {
    await db.close();
}
