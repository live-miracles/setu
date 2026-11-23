import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/src');

// A component declared inside another component's body is a new component type
// on every parent render, so React remounts it and anything typed in it is lost
// (the roster shift form once did this). Components belong at module level.
test('no component is declared inside another function', () => {
    const nested = /^[ \t]+(?:const [A-Z]\w*\s*=\s*(?:\([^)]*\)|\w+)\s*=>|function [A-Z]\w*\s*\()/m;
    for (const dir of ['sections', 'ui']) {
        for (const name of readdirSync(path.join(frontend, dir))) {
            if (!name.endsWith('.tsx')) continue;
            const source = readFileSync(path.join(frontend, dir, name), 'utf8');
            const match = nested.exec(source);
            assert.equal(match, null, `${dir}/${name} declares a nested component: ${match?.[0]}`);
        }
    }
});
