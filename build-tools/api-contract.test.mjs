import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The browser calls the edge function through the typed `Api` interface; the
// handler decodes positional `args`. The interface is an ambient declaration
// the Deno function cannot import, so this test is what ties the two together:
// every operation exists on both sides and the handler reads exactly the
// arguments the interface declares.
const rootUrl = new URL('../', import.meta.url);

function apiOperations(source) {
    const start = source.indexOf('interface Api {');
    const body = source.slice(start, source.indexOf('\n}\n', start));
    const operations = new Map();
    for (const match of body.matchAll(/^ {4}(\w+)\(/gm)) {
        let depth = 1;
        let index = match.index + match[0].length;
        const from = index;
        while (depth > 0) {
            const char = body[index++];
            if (char === '(') depth++;
            if (char === ')') depth--;
        }
        const params = body.slice(from, index - 1);
        let nesting = 0;
        let count = params.trim() ? 1 : 0;
        for (const char of params) {
            if ('<({['.includes(char)) nesting++;
            if ('>)}]'.includes(char)) nesting--;
            if (char === ',' && nesting === 0) count++;
        }
        // A trailing comma (prettier's style) does not add a parameter.
        if (/,\s*$/.test(params)) count--;
        operations.set(match[1], count);
    }
    return operations;
}

function handlerOperations(source) {
    const start = source.indexOf('const operationHandlers');
    const body = source.slice(start);
    const matches = [...body.matchAll(/^ {4}(\w+): async /gm)];
    const operations = new Map();
    matches.forEach((match, index) => {
        const block = body
            .slice(match.index, matches[index + 1]?.index ?? body.length)
            .replace(/\/\/.*$/gm, '');
        const indexes = [...block.matchAll(/args\[(\d+)\]/g)].map((m) => Number(m[1]));
        operations.set(match[1], {
            used: indexes.length ? Math.max(...indexes) + 1 : 0,
            readsLastArgument: block.includes('args.length - 1'),
        });
    });
    return operations;
}

const api = apiOperations(await readFile(new URL('shared/types.d.ts', rootUrl), 'utf8'));
const handler = handlerOperations(
    await readFile(new URL('supabase/functions/api/handler.ts', rootUrl), 'utf8'),
);

test('every Api operation has a handler and every handler is an Api operation', () => {
    assert.ok(api.size > 50, 'the Api interface should have been parsed');
    assert.deepEqual(
        [...api.keys()].filter((name) => !handler.has(name)),
        [],
        'Api operations without a handler',
    );
    assert.deepEqual(
        [...handler.keys()].filter((name) => !api.has(name)),
        [],
        'handlers that are not part of the Api interface',
    );
});

test('handlers read exactly the arguments the Api interface declares', () => {
    for (const [name, declared] of api) {
        const { used, readsLastArgument } = handler.get(name);
        if (readsLastArgument) {
            assert.ok(used < declared, `${name} reads past its declared arguments`);
        } else {
            assert.equal(
                used,
                declared,
                `${name}: handler reads ${used}, Api declares ${declared}`,
            );
        }
    }
});
