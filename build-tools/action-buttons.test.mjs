import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'frontend/src/sections/refine-app.tsx'), 'utf8');

assert.doesNotMatch(
    source,
    /icon=\{<PlusOutlined \/>\}[\s\S]{0,180}>\s*(Add|New)\s*<\/Button>/,
    'add/new controls should be icon-only',
);
assert.doesNotMatch(
    source,
    /icon=\{<EditOutlined \/>\}[\s\S]{0,180}>\s*Edit\s*<\/Button>/,
    'edit controls should be icon-only',
);
assert.doesNotMatch(
    source,
    /icon=\{<DeleteOutlined \/>\}[\s\S]{0,180}>\s*Delete\s*<\/Button>/,
    'delete controls should be icon-only',
);
assert.match(
    source,
    /onClick=\{\(\) => onAction\(action\)\}[\s\S]{0,80}>\s*\{action\}\s*<\/Button>/,
    'workflow controls should keep visible action labels',
);
assert.doesNotMatch(
    source,
    /function WorkflowActions[\s\S]{0,900}icon=\{icon\?\.\(action\)\}/,
    'workflow controls should not render icons',
);
assert.doesNotMatch(
    source,
    /icon=\{<(CopyOutlined|CalendarOutlined) \/>\}[\s\S]{0,180}>\s*(Duplicate|Reschedule)\s*<\/Button>/,
    'duplicate and reschedule controls should be text-only',
);
