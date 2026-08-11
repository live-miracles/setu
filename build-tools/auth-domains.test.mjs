import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/Auth.ts'), 'utf8');

assert.match(
    source,
    /ALLOWED_EMAIL_DOMAINS/,
    'auth should read the plural allowed-domains property',
);
assert.match(
    source,
    /\.split\(['"]*,['"]\)/,
    'auth should parse comma-separated domains',
);
assert.match(
    source,
    /ALLOWED_EMAIL_DOMAIN/,
    'auth should retain the singular property as a migration fallback',
);
