import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

async function loadFailureUpdate() {
    const source = await readFile(new URL('../src/EmailDispatcher.ts', import.meta.url), 'utf8');
    const start = source.indexOf('const MAX_DELIVERY_ATTEMPTS');
    const end = source.indexOf('function formatEmailBody(');
    const { code } = await transform(
        `${source.slice(start, end)}\nexport { failureUpdate, MAX_DELIVERY_ATTEMPTS };`,
        { loader: 'ts', format: 'esm' },
    );
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('a failed email send is retried with a growing delay, then marked failed', async () => {
    const { failureUpdate, MAX_DELIVERY_ATTEMPTS } = await loadFailureUpdate();
    const before = Date.now();
    const first = failureUpdate(1, new Error('Service invoked too many times'));
    assert.equal(first.status, 'pending');
    assert.match(first.last_error, /too many times/);
    const firstDelay = Date.parse(first.next_attempt_at) - before;
    assert.ok(firstDelay >= 9.9 * 60 * 1000 && firstDelay <= 10.5 * 60 * 1000);

    const third = failureUpdate(3, 'boom');
    assert.ok(Date.parse(third.next_attempt_at) - before >= 29.9 * 60 * 1000);

    assert.deepEqual(failureUpdate(MAX_DELIVERY_ATTEMPTS, 'boom'), {
        status: 'failed',
        last_error: 'boom',
    });
});
