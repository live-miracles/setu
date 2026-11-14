// Isolated PostgreSQL check for the inventory places migration; does not
// connect to hosted data. Install @electric-sql/pglite in a temporary
// directory, then run:
// node build-tools/inventory-places-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
    // The two tables as they were before the migration, with free-text
    // locations (some padded or empty) to backfill from.
    await db.exec(`
        create role authenticated;
        create function public.set_updated_at() returns trigger language plpgsql as $$
          begin new.updated_at = now(); return new; end; $$;
        create table public.inventory_types (
          id uuid primary key, name text not null, location text not null default ''
        );
        create table public.inventory_type_labels (
          id uuid primary key,
          inventory_type_id uuid not null references public.inventory_types(id),
          name text not null,
          location text not null default ''
        );
        insert into public.inventory_types values
          ('${uuid(1)}', 'Camera', 'Studio 2'),
          ('${uuid(2)}', 'Tripod', ' Studio 2 '),
          ('${uuid(3)}', 'Cable', ''),
          ('${uuid(4)}', 'Light', 'Store room');
        insert into public.inventory_type_labels values
          ('${uuid(11)}', '${uuid(1)}', 'CAM-1', 'Studio 5'),
          ('${uuid(12)}', '${uuid(1)}', 'CAM-2', ''),
          ('${uuid(13)}', '${uuid(3)}', 'CBL-1', 'Store room');
    `);

    await db.exec(
        await readFile(
            new URL('../supabase/migrations/20261114000000_inventory_places.sql', import.meta.url),
            'utf8',
        ),
    );

    const places = (await db.query('select id, name from public.inventory_places order by name'))
        .rows;
    assert.deepEqual(
        places.map((place) => place.name),
        ['Store room', 'Studio 2', 'Studio 5'],
        'one place per distinct trimmed location, none for empty text',
    );
    const idOf = (name) => places.find((place) => place.name === name).id;

    const typeLocations = (
        await db.query('select name, location_id from public.inventory_types order by name')
    ).rows;
    assert.deepEqual(
        typeLocations.map((row) => [row.name, row.location_id]),
        [
            ['Cable', null],
            ['Camera', idOf('Studio 2')],
            ['Light', idOf('Store room')],
            ['Tripod', idOf('Studio 2')],
        ],
    );
    const labelLocations = (
        await db.query('select name, location_id from public.inventory_type_labels order by name')
    ).rows;
    assert.deepEqual(
        labelLocations.map((row) => [row.name, row.location_id]),
        [
            ['CAM-1', idOf('Studio 5')],
            ['CAM-2', null],
            ['CBL-1', idOf('Store room')],
        ],
    );

    for (const table of ['inventory_types', 'inventory_type_labels']) {
        const columns = (
            await db.query(
                `select column_name from information_schema.columns
                 where table_schema = 'public' and table_name = $1`,
                [table],
            )
        ).rows.map((row) => row.column_name);
        assert.ok(!columns.includes('location'), `${table} no longer has free-text location`);
        assert.ok(columns.includes('location_id'), `${table} has location_id`);
    }

    // Names are unique, and a place in use cannot be deleted.
    await assert.rejects(
        db.query(`insert into public.inventory_places (name) values ('Studio 2')`),
        /unique/i,
    );
    await assert.rejects(
        db.query('delete from public.inventory_places where id = $1', [idOf('Studio 2')]),
        /foreign key/i,
    );
    await db.query(`insert into public.inventory_places (name) values ('Unused')`);
    await db.query(`delete from public.inventory_places where name = 'Unused'`);

    // Renaming a place shows up on every item that points at it.
    await db.query('update public.inventory_places set name = $1 where id = $2', [
        'Studio Two',
        idOf('Studio 2'),
    ]);
    const renamed = (
        await db.query(
            `select count(*)::int as n from public.inventory_types t
             join public.inventory_places p on p.id = t.location_id
             where p.name = 'Studio Two'`,
        )
    ).rows[0].n;
    assert.equal(renamed, 2);

    const policies = (
        await db.query(`select policyname from pg_policies where tablename = 'inventory_places'`)
    ).rows;
    assert.equal(policies.length, 1, 'inventory places are read-only through RLS');
    console.log('inventory places SQL check passed');
} finally {
    await db.close();
}
