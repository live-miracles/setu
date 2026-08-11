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
const extraPrograms = source.slice(
    source.indexOf('const EXTRA_APPROVED_PROGRAM_REQUESTS'),
    source.indexOf('const EXTRA_APPROVED_PROGRAM_SESSIONS'),
);

assert.doesNotMatch(
    source,
    /\{ Id: 'program-type-other', Name: 'Other'/,
    'mock program types should not include the built-in Other option',
);
assert.match(
    extraPrograms,
    /Type: 'Livestream'[\s\S]*Type: 'Livestream'/,
    'extra mock programs should include Livestream more than once',
);
assert.match(
    extraPrograms,
    /Type: 'Recording'[\s\S]*Type: 'Recording'/,
    'extra mock programs should include Recording more than once',
);
assert.match(
    extraPrograms,
    /Type: 'Webinar'[\s\S]*Type: 'Webinar'/,
    'extra mock programs should include Webinar more than once',
);
assert.match(
    extraPrograms,
    /Type: 'Meeting'[\s\S]*Type: 'Meeting'/,
    'extra mock programs should include Meeting more than once',
);
assert.match(
    extraPrograms,
    /Type: 'Visit'[\s\S]*Type: 'Visit'/,
    'extra mock programs should include Visit more than once',
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
assert.doesNotMatch(
    source,
    /const EXTRA_APPROVED_PROGRAM_REQUESTS[\s\S]{0,140}Array\.from/,
    'extra mock program requests should be explicit fixtures',
);
assert.doesNotMatch(
    source,
    /const EXTRA_APPROVED_PROGRAM_SESSIONS[\s\S]{0,180}flatMap/,
    'extra mock sessions should be explicit fixtures',
);
