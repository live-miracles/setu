// Shared pieces of the builds. `npm run build` (build.mjs) emits the Apps
// Script HTML shell and `npm run dev` (dev.mjs) emits a plain static page for
// the local Supabase-backed app. Both render
// frontend/shell.html — one copy of the page chrome, rather than a template
// per target that has to be kept identical by hand.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const distDir = path.join(root, 'frontend/dist');

const TITLE = 'Setu';

/**
 * The dev tab icon, inlined as a data URI. Dev serves a top-level document,
 * so a <link rel="icon"> here is what the browser tab actually reads, and
 * inlining keeps the dev server free of a second asset route. 64px is the
 * largest source that stays cheap once base64'd while still covering retina
 * tabs; frontend/assets/logo.png is the master image for regenerating the icon set.
 *
 * Production deliberately gets nothing here: Apps Script serves the app in an
 * iframe, so the browser tab belongs to Google's outer page and an icon in
 * this document is inert. doGet() sets the real one via setFaviconUrl().
 */
export function devFaviconTag() {
    const png = readFileSync(path.join(root, 'frontend/icons/icon-64.png')).toString('base64');
    return `<link rel="icon" type="image/png" href="data:image/png;base64,${png}" />`;
}

/**
 * @param {{ title: string, favicon: string, head: string, body: string }} slots
 */
export function renderShell({ title, favicon, head, body }) {
    return readFileSync(path.join(root, 'frontend/shell.html'), 'utf8')
        .replaceAll('<!--#TITLE#-->', title)
        .replace('<!--#FAVICON#-->', () => favicon)
        .replace('<!--#HEAD#-->', () => head)
        .replace('<!--#BODY#-->', () => body);
}

function inlineScript(script) {
    // Apps Script parses the HTML before the browser parses this inline
    // JavaScript. Escape script/template delimiters and raw control characters
    // that can be accepted by Node but rejected by the browser in HTML.
    return script
        .replace(/<\/script/gi, '<\\/script')
        .replaceAll('<!--', '\\x3c!--')
        .replaceAll('-->', '--\\x3e')
        .replaceAll('?>', '?\\x3e')
        .replace(
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
            (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
        );
}

/** The Apps Script page with assets embedded in Index.html. */
export function renderInlineProdShell({ script, style }) {
    return renderShell({
        title: TITLE,
        favicon: '',
        head: `<style>${style}</style>`,
        body: `<script>${inlineScript(script)}</script>`,
    });
}

/** The page the local dev server serves out of frontend/dist. */
export function renderDevShell() {
    return renderShell({
        title: TITLE,
        favicon: devFaviconTag(),
        head: '<link rel="stylesheet" href="app.css" />',
        body: '<script src="app.js"></script>',
    });
}

/** The local dev page with the watcher outputs embedded in the response. */
export function renderInlineDevShell({ script, style }) {
    return renderShell({
        title: TITLE,
        favicon: devFaviconTag(),
        head: `<style>${style}</style>`,
        body: `<script>${inlineScript(script)}</script>`,
    });
}

/**
 * esbuild options shared by the two builds. Two things vary, and they vary
 * independently — hence a mode rather than a dev/prod boolean:
 *
 *   entry point — all builds use main.ts so local and deployed code exercise
 *     the same Supabase transport.
 *   output — prod is validated in memory; dev writes files for the local
 *     server.
 *
 * @param {'dev' | 'prod'} mode
 */
export function esbuildOptions(mode) {
    const optimized = mode !== 'dev';
    return {
        entryPoints: [path.join(root, 'frontend/src/main.ts')],
        bundle: true,
        // The bundle runs as one external script in an Apps Script iframe, so
        // it must declare nothing and leak nothing to global scope.
        format: 'iife',
        target: 'es2019',
        charset: 'utf8',
        logLevel: 'info',
        minify: optimized,
        loader: { '.png': 'dataurl', '.avif': 'dataurl', '.wasm': 'binary' },
        // Minified output still carries readable function names, so a stack
        // trace from the deployed app stays diagnosable. Costs ~1% of size.
        keepNames: optimized,
        sourcemap: optimized ? false : 'inline',
        ...(mode === 'prod'
            ? { write: false, outfile: 'app.js' }
            : { outfile: path.join(distDir, 'app.js') }),
    };
}

// The local binary rather than `npx @tailwindcss/cli`: npx wraps the real
// process in two extra shells, which swallow the signals that are supposed
// to shut a watcher down and leave it orphaned holding its output file.
export const TAILWIND_BIN = path.join(
    root,
    'node_modules/.bin',
    process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss',
);

export const TAILWIND_ARGS = (out, extra = []) => [
    '-i',
    path.join(root, 'frontend/input.css'),
    '-o',
    out,
    ...extra,
];

/**
 * One-shot minified Tailwind build to `outFile`, for the two builds that run
 * to completion and exit. dev.mjs spawns the watcher itself — it needs the
 * long-lived child process to hold on to and kill, not a return value.
 */
export function compileCss(outFile) {
    execFileSync(TAILWIND_BIN, TAILWIND_ARGS(outFile, ['--minify']), {
        cwd: root,
        stdio: 'inherit',
    });
}
