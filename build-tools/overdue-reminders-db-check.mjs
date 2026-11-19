// Isolated PostgreSQL check for the overdue inventory reminder timing; does not
// connect to hosted data. Run with:
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
        create table public.inventory_requests (
          id uuid primary key, status text not null, end_date date not null
        );
        create table public.comments (
          id uuid primary key default gen_random_uuid(),
          inventory_request_id uuid, author_id uuid, author_name text,
          message text not null, created_at timestamptz not null default now()
        );
    `);

    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261119000000_overdue_reminder_grace_day.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    // Dates relative to today: due today / yesterday (grace) / two days ago.
    await db.exec(`
        insert into public.inventory_requests values
          ('${uuid(1)}', 'issued', current_date),
          ('${uuid(2)}', 'issued', current_date - 1),
          ('${uuid(3)}', 'issued', current_date - 2),
          ('${uuid(4)}', 'returned', current_date - 5),
          ('${uuid(5)}', 'issued', date '2020-01-01');
    `);

    const remindedIds = async () =>
        (
            await db.query(
                'select inventory_request_id as id from public.comments order by inventory_request_id',
            )
        ).rows.map((row) => row.id);

    await db.query('select public.create_overdue_inventory_reminders()');
    assert.deepEqual(
        await remindedIds(),
        [uuid(3), uuid(5)],
        'reminders start two days after the due date; the day after it is still a grace day',
    );

    await db.query('select public.create_overdue_inventory_reminders()');
    assert.deepEqual(
        await remindedIds(),
        [uuid(3), uuid(5)],
        'running again the same day does not send a second reminder',
    );

    // The following day the same request is reminded again, and the one that
    // was on its grace day now gets its first reminder.
    await db.exec(`
        update public.comments set created_at = created_at - interval '1 day';
        update public.inventory_requests set end_date = end_date - 1;
    `);
    await db.query('select public.create_overdue_inventory_reminders()');
    assert.deepEqual(
        await remindedIds(),
        [uuid(2), uuid(3), uuid(3), uuid(5), uuid(5)],
        'reminders repeat every day once they have started',
    );

    // The due date reads as day, month name, year.
    await db.exec(`
        delete from public.comments;
        update public.inventory_requests set end_date = date '2025-11-05' where id = '${uuid(3)}';
    `);
    await db.query('select public.create_overdue_inventory_reminders()');
    const message = (
        await db.query('select message from public.comments where inventory_request_id = $1', [
            uuid(3),
        ])
    ).rows[0].message;
    assert.match(
        message,
        /^This is a reminder that the equipment you borrowed was due to be returned on 5 Nov 2025\. /,
        'the due date is written as day, short English month name and year',
    );

    console.log('overdue reminder SQL checks passed');
} finally {
    await db.close();
}
