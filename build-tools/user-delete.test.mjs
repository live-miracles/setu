import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const admin = readFileSync(path.join(root, 'src/Admin.ts'), 'utf8');
const types = readFileSync(path.join(root, 'shared/types.d.ts'), 'utf8');
const api = readFileSync(path.join(root, 'frontend/src/api.ts'), 'utf8');
const mock = readFileSync(path.join(root, 'frontend/src/mock/backend.ts'), 'utf8');
const usersPage = readFileSync(path.join(root, 'frontend/src/sections/refine-app.tsx'), 'utf8');

assert.match(types, /deleteUser\(userId: string, requestId: string\): void;/);
assert.match(api, /deleteUser: \(\.\.\.args\) => callBackend\('deleteUser', \.\.\.args\)/);
assert.match(admin, /function deleteUser\(userId: string, requestId: string\): void/);
assert.match(admin, /withLockedDedupe\('user:delete', requestId, \(\) => \{/);
assert.match(admin, /Tables\.Users\.deleteById\(userId\)/);
assert.doesNotMatch(
    admin,
    /function deleteUser[\s\S]*?(Tables\.(?:InventoryRequests|ProgramRequests|Tickets|Comments|Rosters)\.)/,
);
assert.match(mock, /deleteUser: \(userId: string\) => \{/);
assert.match(usersPage, /api\.deleteUser\(deleting\.Email, generateRequestId\(\)\)/);
assert.match(usersPage, /action="delete"/);
