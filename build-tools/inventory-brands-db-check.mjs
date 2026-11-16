// Isolated PostgreSQL check for the inventory brands migration; does not
// connect to hosted data. Install @electric-sql/pglite in a temporary
// directory, then run:
// node build-tools/inventory-brands-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function rejectsWith(promise, code, message) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, message);
        return true;
    });
}

try {
    // inventory_types as it was before the migration, with free-text brands
    // (one padded, one empty) to backfill from.
    await db.exec(`
        create role authenticated;
        create function public.set_updated_at() returns trigger language plpgsql as $$
          begin new.updated_at = now(); return new; end; $$;
        create table public.inventory_types (
          id uuid primary key, brand text not null default '', name text not null,
          model text not null default '', unique (brand, name, model)
        );
        insert into public.inventory_types values
          ('${uuid(1)}', 'Sony', 'Camera', ''),
          ('${uuid(2)}', ' Sony ', 'Tripod', ''),
          ('${uuid(3)}', '', 'Cable', ''),
          ('${uuid(4)}', 'Canon', 'Light', '');
    `);

    await db.exec(
        await readFile(
            new URL('../supabase/migrations/20261116010000_inventory_brands.sql', import.meta.url),
            'utf8',
        ),
    );

    const brands = (await db.query('select id, name from public.inventory_brands order by name'))
        .rows;
    assert.deepEqual(
        brands.map((brand) => brand.name),
        ['Canon', 'Sony'],
        'one brand per distinct trimmed brand, none for empty text',
    );
    const idOf = (name) => brands.find((brand) => brand.name === name).id;

    const typeBrands = (
        await db.query('select name, brand from public.inventory_types order by name')
    ).rows;
    assert.deepEqual(
        typeBrands.map((row) => [row.name, row.brand]),
        [
            ['Cable', ''],
            ['Camera', 'Sony'],
            ['Light', 'Canon'],
            ['Tripod', 'Sony'],
        ],
        'brand text is trimmed to match the list; types without a brand stay empty',
    );

    await rejectsWith(
        db.query(`insert into public.inventory_types (id, brand, name) values ($1, 'Nikon', 'X')`, [
            uuid(5),
        ]),
        '23503',
        'a type cannot be created with a brand that is not listed',
    );
    await rejectsWith(
        db.query(`update public.inventory_types set brand = 'Nikon' where id = $1`, [uuid(1)]),
        '23503',
        'a type cannot be moved to a brand that is not listed',
    );
    await db.query(`insert into public.inventory_types (id, name) values ($1, 'No brand')`, [
        uuid(6),
    ]);
    await db.query(`update public.inventory_types set name = 'Renamed' where id = $1`, [uuid(1)]);

    await rejectsWith(
        db.query('delete from public.inventory_brands where id = $1', [idOf('Sony')]),
        '23503',
        'a brand used by a type cannot be deleted',
    );
    await db.query(`insert into public.inventory_brands (name) values ('Unused')`);
    await db.query(`delete from public.inventory_brands where name = 'Unused'`);

    await db.query('update public.inventory_brands set name = $1 where id = $2', [
        'Sony Corp',
        idOf('Sony'),
    ]);
    const renamed = (
        await db.query(
            `select name from public.inventory_types where brand = 'Sony Corp' order by name`,
        )
    ).rows;
    assert.deepEqual(
        renamed.map((row) => row.name),
        ['Renamed', 'Tripod'],
        'renaming a brand renames it on every type that uses it',
    );

    await rejectsWith(
        db.query(`insert into public.inventory_brands (name) values ('Canon')`),
        '23505',
        'brand names are unique',
    );

    const policies = (
        await db.query(`select policyname from pg_policies where tablename = 'inventory_brands'`)
    ).rows;
    assert.equal(policies.length, 1, 'inventory brands are read-only through RLS');
    console.log('inventory brands SQL check passed');
} finally {
    await db.close();
}
