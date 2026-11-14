// Isolated PostgreSQL check for the optional label name migration; does not
// connect to hosted data. Install @electric-sql/pglite in a temporary
// directory, then run:
// node build-tools/optional-label-name-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const insertLabel = (id, typeId, name) =>
    db.query('insert into public.inventory_type_labels values ($1, $2, $3)', [id, typeId, name]);

try {
    // The labels table as it was before the migration: unique (type, name).
    await db.exec(`
        create table public.inventory_types (id uuid primary key);
        create table public.inventory_type_labels (
          id uuid primary key,
          inventory_type_id uuid not null references public.inventory_types(id),
          name text not null,
          unique (inventory_type_id, name)
        );
        insert into public.inventory_types values ('${uuid(1)}'), ('${uuid(2)}');
    `);
    await insertLabel(uuid(11), uuid(1), '');
    await assert.rejects(insertLabel(uuid(12), uuid(1), ''), /unique/i, 'old rule');

    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261114100000_optional_label_name.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    // Any number of unnamed labels per type; named ones stay unique per type.
    await insertLabel(uuid(12), uuid(1), '');
    await insertLabel(uuid(13), uuid(1), '');
    await insertLabel(uuid(14), uuid(1), 'CAM-1');
    await assert.rejects(insertLabel(uuid(15), uuid(1), 'CAM-1'), /unique/i);
    await insertLabel(uuid(16), uuid(2), 'CAM-1');
    console.log('optional label name SQL check passed');
} finally {
    await db.close();
}
