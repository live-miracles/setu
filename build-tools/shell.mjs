// Shared pieces of the three builds. `npm run build` (build.mjs) emits the
// Apps Script HTML shell; `npm run dev` (dev.mjs) emits a plain static page
// for the local server; `npm run pages` (pages.mjs) emits the public demo and
// production assets CI publishes to gh-pages. All three render
// frontend/shell.html — one copy of the page chrome, rather than a template
// per target that has to be kept identical by hand.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const distDir = path.join(root, 'frontend/dist');
/** What CI publishes to the gh-pages branch — see build-tools/pages.mjs. */
export const siteDir = path.join(root, 'site');

const TITLE = 'Setu';
const PACKAGE_VERSION = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const PROD_ASSET_BASE = 'https://live-miracles.github.io/setu/prod';

/**
 * The dev tab icon, inlined as a data URI. Dev serves a top-level document,
 * so a <link rel="icon"> here is what the browser tab actually reads, and
 * inlining keeps the dev server free of a second asset route. 64px is the
 * largest source that stays cheap once base64'd while still covering retina
 * tabs; frontend/logo.png is the master image for regenerating the icon set.
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
        .replace('<!--#FAVICON#-->', favicon)
        .replace('<!--#HEAD#-->', head)
        .replace('<!--#BODY#-->', body);
}

/** The page Apps Script serves — assets are hosted on GitHub Pages. */
export function renderProdShell() {
    return renderShell({
        title: TITLE,
        favicon: '',
        head: `<link rel="stylesheet" href="${PROD_ASSET_BASE}/app.css?v=${PACKAGE_VERSION}" />`,
        body: `<script src="${PROD_ASSET_BASE}/app.js?v=${PACKAGE_VERSION}"></script>`,
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

/**
 * The page GitHub Pages serves out of site/. Also a top-level document, but
 * unlike dev it ships alongside the icons directory, so the tag can just point
 * at the real file and let the browser cache it — this page is loaded by
 * strangers over the network, not by one person on localhost.
 */
export function renderDemoShell() {
    return renderShell({
        title: TITLE,
        favicon: '<link rel="icon" type="image/png" href="icons/icon-192.png" />',
        head: '<link rel="stylesheet" href="app.css" />',
        body: '<script src="app.js"></script>',
    });
}

/**
 * esbuild options shared by the three builds. Two things vary, and they vary
 * independently — hence a mode rather than a dev/prod boolean:
 *
 *   entry point — dev.ts pulls in the mock backend, main.ts does not, so the
 *     deployed bundle cannot contain mock data no matter what. `demo` is the
 *     mock entry point built to production settings: that is the whole point
 *     of it, a real build of the real UI with nothing behind it.
 *   output — prod is validated in memory; dev, demo, and the public production
 *     asset build write files a server or GitHub Pages hands out.
 *
 * @param {'dev' | 'demo' | 'prod'} mode
 */
export function esbuildOptions(mode) {
    const optimized = mode !== 'dev';
    return {
        entryPoints: [
            path.join(root, mode === 'prod' ? 'frontend/src/main.ts' : 'frontend/src/dev.ts'),
        ],
        bundle: true,
        // The bundle runs as one external script in an Apps Script iframe, so
        // it must declare nothing and leak nothing to global scope.
        format: 'iife',
        target: 'es2019',
        charset: 'utf8',
        logLevel: 'info',
        minify: optimized,
        loader: { '.png': 'dataurl' },
        // Minified output still carries readable function names, so a stack
        // trace from the deployed app stays diagnosable. Costs ~1% of size.
        keepNames: optimized,
        sourcemap: optimized ? false : 'inline',
        ...(mode === 'prod'
            ? { write: false, outfile: 'app.js' }
            : { outfile: path.join(mode === 'dev' ? distDir : siteDir, 'app.js') }),
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
