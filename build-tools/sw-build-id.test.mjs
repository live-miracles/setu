import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SW_BUILD_ID_PLACEHOLDER, contentBuildId, root, stampServiceWorker } from './shell.mjs';

const swSource = readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');

test('sw.js carries the placeholder that the build stamps', () => {
    assert.ok(swSource.includes(SW_BUILD_ID_PLACEHOLDER));
});

test('stamping replaces every placeholder and yields a different worker per build', () => {
    const a = stampServiceWorker(swSource, 'aaaaaaaaaaaa');
    const b = stampServiceWorker(swSource, 'bbbbbbbbbbbb');
    assert.ok(!a.includes(SW_BUILD_ID_PLACEHOLDER));
    assert.ok(a.includes('aaaaaaaaaaaa'));
    // Chrome installs a new worker only when sw.js differs, so the stamp must change the bytes.
    assert.notEqual(a, b);
});

test('stamping refuses a worker without the placeholder', () => {
    assert.throws(() => stampServiceWorker('const CACHE = "x";', 'abc'), /placeholder/);
});

test('the build id follows the content of the built files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'setu-build-id-'));
    try {
        const js = path.join(dir, 'app.js');
        const css = path.join(dir, 'app.css');
        writeFileSync(js, 'one');
        writeFileSync(css, 'style');
        const first = contentBuildId([js, css]);
        assert.match(first, /^[0-9a-f]{12}$/);
        assert.equal(contentBuildId([js, css]), first, 'same files, same id');
        writeFileSync(js, 'two');
        assert.notEqual(contentBuildId([js, css]), first, 'a changed file changes the id');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
