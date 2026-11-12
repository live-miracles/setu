// Shared test harness: bundles the real edge-function and frontend sources, so
// tests cross the same interfaces as production callers instead of stripping
// imports and re-declaring helpers by hand.
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

// Loads `entry` (JS/TS source that re-exports what the test needs) bundled with
// the real repository code. Deno-only `npm:` specifiers are resolved to the
// installed Node packages (zod) or, for anything else, to the stub source given
// in `stubs` (key: specifier). `banner` runs first, e.g. to define `Deno`.
export async function loadBundle(entry, { stubs = {}, banner = '' } = {}) {
    const bundle = await build({
        bundle: true,
        format: 'esm',
        platform: 'node',
        write: false,
        banner: { js: banner },
        stdin: { resolveDir: process.cwd(), contents: entry, loader: 'ts' },
        plugins: [
            {
                name: 'deno-specifiers',
                setup(b) {
                    b.onResolve({ filter: /^npm:/ }, (args) => {
                        if (args.path in stubs) return { path: args.path, namespace: 'stub' };
                        if (args.path.startsWith('npm:zod@')) {
                            return { path: require.resolve('zod') };
                        }
                        return { path: args.path, namespace: 'stub' };
                    });
                    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
                        contents: stubs[args.path] ?? 'export {};',
                        loader: 'js',
                    }));
                },
            },
        ],
    });
    return import(
        `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
    );
}

// In-memory stand-in for PostgREST: honours filters/order/range, truncates at
// max-rows like a hosted project, and rejects `.in()` lists too long for a URL.
// Reads only; tests that exercise writes hand it `insert`/`update`/`delete`
// handlers through `writes`.
const MAX_ROWS = 1000;
const MAX_IN_VALUES = 100;
export function fakeClient(tables, calls = []) {
    return {
        from(table) {
            const filters = [];
            const orders = [];
            let bounds = null;
            const query = {
                select: () => query,
                eq: (column, value) => (filters.push((row) => row[column] === value), query),
                lt: (column, value) => (filters.push((row) => row[column] < value), query),
                gt: (column, value) => (filters.push((row) => row[column] > value), query),
                gte: (column, value) => (filters.push((row) => row[column] >= value), query),
                limit: (count) => ((bounds = [0, count - 1]), query),
                is: (column, value) => (filters.push((row) => row[column] === value), query),
                not: (column, op, value) => (
                    filters.push((row) => !(op === 'is' && row[column] === value)),
                    query
                ),
                in: (column, values) => {
                    if (values.length > MAX_IN_VALUES) throw new Error('URI too long');
                    filters.push((row) => values.includes(row[column]));
                    return query;
                },
                order: (column) => (orders.push(column), query),
                range: (from, to) => ((bounds = [from, to]), query),
                single: () => query.then((res) => ({ data: res.data?.[0] ?? null, error: null })),
                maybeSingle: () =>
                    query.then((res) => ({ data: res.data?.[0] ?? null, error: null })),
                then(resolve, reject) {
                    let rows = (tables[table] || []).filter((row) => filters.every((f) => f(row)));
                    rows = [...rows].sort((a, b) => {
                        for (const column of orders) {
                            if (a[column] < b[column]) return -1;
                            if (a[column] > b[column]) return 1;
                        }
                        return 0;
                    });
                    const from = bounds ? bounds[0] : 0;
                    const to = bounds ? bounds[1] : MAX_ROWS - 1;
                    calls.push({ table, from, to });
                    return Promise.resolve({
                        data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)),
                        error: null,
                    }).then(resolve, reject);
                },
            };
            return query;
        },
    };
}
