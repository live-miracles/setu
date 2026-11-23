import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The browser calls the edge function through the typed `Api` interface; the
// operation table (supabase/functions/api/operations.ts) declares the positional
// arguments each operation takes. The interface is an ambient declaration the
// Deno function cannot import, so this test is what ties the two together:
// every operation exists on both sides, takes the same number of arguments, and
// the server never requires an argument the browser is allowed to leave out.
const rootUrl = new URL('../', import.meta.url);

// Splits on top-level commas, so generics, tuples and call arguments stay whole.
function splitTopLevel(text) {
    const parts = [];
    let nesting = 0;
    let current = '';
    for (const char of text) {
        if ('<({['.includes(char)) nesting++;
        if ('>)}]'.includes(char)) nesting--;
        if (char === ',' && nesting === 0) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
}

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
        const params = splitTopLevel(body.slice(from, index - 1));
        operations.set(
            match[1],
            params.map((param) => ({ optional: /^\w+\?:/.test(param) })),
        );
    }
    return operations;
}

// Schemas that accept a missing argument.
const OPTIONAL_SCHEMAS = new Set(['optionalText', 'optionalInput', 'page', 'sessions']);

function tableOperations(source) {
    const start = source.indexOf('export const operations');
    const body = source.slice(start);
    const operations = new Map();
    for (const match of body.matchAll(/^ {4}(\w+): operation\(\s*\[/gm)) {
        let depth = 1;
        let index = match.index + match[0].length;
        const from = index;
        while (depth > 0) {
            const char = body[index++];
            if (char === '[') depth++;
            if (char === ']') depth--;
        }
        operations.set(
            match[1],
            splitTopLevel(body.slice(from, index - 1)).map((schema) => ({
                optional: OPTIONAL_SCHEMAS.has(schema),
            })),
        );
    }
    return operations;
}

const api = apiOperations(await readFile(new URL('shared/types.d.ts', rootUrl), 'utf8'));
const table = tableOperations(
    await readFile(new URL('supabase/functions/api/operations.ts', rootUrl), 'utf8'),
);

test('every Api operation is in the operation table and every operation is in the Api', () => {
    assert.ok(api.size > 50, 'the Api interface should have been parsed');
    assert.ok(table.size > 50, 'the operation table should have been parsed');
    assert.deepEqual(
        [...api.keys()].filter((name) => !table.has(name)),
        [],
        'Api operations without a table entry',
    );
    assert.deepEqual(
        [...table.keys()].filter((name) => !api.has(name)),
        [],
        'table operations that are not part of the Api interface',
    );
});

test('the table declares exactly the arguments the Api interface declares', () => {
    for (const [name, declared] of api) {
        const schemas = table.get(name);
        assert.equal(
            schemas.length,
            declared.length,
            `${name}: table declares ${schemas.length} arguments, Api declares ${declared.length}`,
        );
        declared.forEach((param, index) => {
            if (param.optional) {
                assert.ok(
                    schemas[index].optional,
                    `${name}: argument ${index + 1} is optional in the Api but required by the table`,
                );
            }
        });
    }
});
