import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = readFileSync(path.join(root, 'src/Admin.ts'), 'utf8');
const dashboard = readFileSync(path.join(root, 'src/Dashboard.ts'), 'utf8');
const mock = readFileSync(path.join(root, 'frontend/src/mock/backend.ts'), 'utf8');

assert.match(backend, /function getSettings\(\): SettingsPayload/);
assert.match(backend, /shiftTypes:/);
assert.match(backend, /Color: String\(input\.color/);
const oldShiftRead = 'listShift' + 'Presets|' + 'shift' + 'Presets';
assert.doesNotMatch(backend, new RegExp(oldShiftRead));
assert.match(dashboard, /const settings = getSettings\(\)/);
assert.match(mock, /getSettings:/);
assert.match(mock, /Color:/);
const oldShiftApi = [
    'shift',
    'Presets',
    '|createShift',
    'Preset',
    '|updateShift',
    'Preset',
    '|deleteShift',
    'Preset',
].join('');
assert.doesNotMatch(mock, new RegExp(oldShiftApi));

console.log('settings contract test passed');
