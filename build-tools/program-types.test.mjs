import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'frontend/src/mock/backend.ts'), 'utf8');

assert.doesNotMatch(
    source,
    /\{ Id: 'program-type-other', Name: 'Other'/,
    'mock program types should not include the built-in Other option',
);
