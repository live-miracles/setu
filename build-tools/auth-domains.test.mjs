import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/Auth.ts'), 'utf8');

assert.doesNotMatch(
    source,
    /ALLOWED_EMAIL_DOMAIN/,
    'auth should rely on the Google deployment boundary instead of manual domain parsing',
);
