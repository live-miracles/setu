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
assert.match(
    source,
    /Session\.getEffectiveUser\(\)\.getEmail\(\)/,
    'auth should identify the script owner through the effective user',
);
assert.doesNotMatch(
    source,
    /BOOTSTRAP_ADMIN_EMAIL/,
    'auth should not require a bootstrap admin property',
);
