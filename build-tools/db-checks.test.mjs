import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

// Runs every `*-db-check.mjs` script, so the SQL behaviour (transition
// functions, grants, triggers) is verified by `npm test` and CI, not only by a
// script someone remembers to run. Each check boots an isolated in-memory
// PGlite database and applies the real migrations; nothing connects to hosted
// data.
const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const pglite = createRequire(import.meta.url).resolve('@electric-sql/pglite');
const checks = (await readdir(here)).filter((name) => name.endsWith('-db-check.mjs')).sort();

assert.ok(checks.length > 0, 'expected at least one db-check script');

for (const check of checks) {
    test(`SQL check: ${check}`, { timeout: 180_000 }, async () => {
        const { stdout } = await run(process.execPath, [path.join(here, check), pglite], {
            cwd: path.dirname(here),
        });
        assert.match(stdout, /passed/);
    });
}
