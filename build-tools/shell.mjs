// Shared pieces of the two builds. `npm run build` (build.mjs) emits the
// three files Apps Script serves; `npm run dev` (dev.mjs) emits a plain
// static page for browser-sync. Both render frontend/shell.html — one copy
// of the page chrome, rather than a dev shell and a prod template that have
// to be kept identical by hand.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const distDir = path.join(root, 'frontend/dist');

const TITLE = 'Livestream Operations';

/**
 * @param {{ title: string, head: string, body: string }} slots
 */
export function renderShell({ title, head, body }) {
    return readFileSync(path.join(root, 'frontend/shell.html'), 'utf8')
        .replaceAll('<!--#TITLE#-->', title)
        .replace('<!--#HEAD#-->', head)
        .replace('<!--#BODY#-->', body);
}

/** The page Apps Script serves — CSS and JS inlined via its own include(). */
export function renderProdShell() {
    return renderShell({
        title: TITLE,
        head: "<?!= include('Stylesheet'); ?>",
        body: "<?!= include('JavaScript'); ?>",
    });
}

/** The page browser-sync serves out of frontend/dist. */
export function renderDevShell() {
    return renderShell({
        title: `${TITLE} (dev)`,
        head: '<link rel="stylesheet" href="app.css" />',
        body: '<script src="app.js"></script>',
    });
}

/**
 * esbuild options shared by both builds. The entry point is the only
 * difference that matters: dev.ts pulls in the mock backend, main.ts does
 * not, so the deployed bundle cannot contain mock data no matter what.
 *
 * @param {'dev' | 'prod'} mode
 */
export function esbuildOptions(mode) {
    const dev = mode === 'dev';
    return {
        entryPoints: [path.join(root, dev ? 'frontend/src/dev.ts' : 'frontend/src/main.ts')],
        bundle: true,
        // Everything runs inside one <script> in an Apps Script iframe, so
        // the bundle must declare nothing and leak nothing to global scope.
        format: 'iife',
        target: 'es2019',
        charset: 'utf8',
        logLevel: 'info',
        minify: !dev,
        // Minified output still carries readable function names, so a stack
        // trace from the deployed app stays diagnosable. Costs ~1% of size.
        keepNames: !dev,
        sourcemap: dev ? 'inline' : false,
        ...(dev ? { outfile: path.join(distDir, 'app.js') } : { write: false, outfile: 'app.js' }),
    };
}

export const TAILWIND_ARGS = (out, extra = []) => [
    '@tailwindcss/cli',
    '-i',
    path.join(root, 'frontend/input.css'),
    '-o',
    out,
    ...extra,
];
