import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['build-tools/build-backend.mjs'], {
    stdio: 'inherit',
});

assert.equal(existsSync('.clasp-build/Code.js'), true);
assert.equal(existsSync('.clasp-build/appsscript.json'), true);
assert.match(readFileSync('.clasp-build/Admin.js', 'utf8'), /function listUsers\(\)/);
assert.doesNotMatch(readFileSync('.clasp-build/Admin.js', 'utf8'), /function listUsers\(\):/);
