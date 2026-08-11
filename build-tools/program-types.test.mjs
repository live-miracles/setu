import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'frontend/src/mock/backend.ts'), 'utf8');
const programRequests = source.slice(
    source.indexOf('programRequests: ['),
    source.indexOf('    sessions: [', source.indexOf('programRequests: [')),
);

assert.doesNotMatch(
    source,
    /\{ Id: 'program-type-other', Name: 'Other'/,
    'mock program types should not include the built-in Other option',
);
assert.match(
    source,
    /Type: \['Livestream', 'Recording', 'Webinar', 'Meeting', 'Visit'\]\[index % 5\]/,
    'extra mock programs should cycle through the available program types',
);
assert.doesNotMatch(
    programRequests,
    /Type: 'Dry run'/,
    'mock program requests should use available program types',
);
assert.doesNotMatch(
    programRequests,
    /Type: 'Live'/,
    'mock program requests should use available program types',
);
