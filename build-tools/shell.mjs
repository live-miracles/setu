// Shared pieces of the three builds. `npm run build` (build.mjs) emits the
// three files Apps Script serves; `npm run dev` (dev.mjs) emits a plain
// static page for the local server; `npm run pages` (pages.mjs) emits the
// public demo site CI publishes to gh-pages. All three render
// frontend/shell.html — one copy of the page chrome, rather than a template
// per target that has to be kept identical by hand.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const distDir = path.join(root, 'frontend/dist');
/** What CI publishes to the gh-pages branch — see build-tools/pages.mjs. */
export const siteDir = path.join(root, 'site');

const TITLE = 'Setu';

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
function devFaviconTag() {
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

/** The page Apps Script serves — CSS and JS inlined via its own include(). */
export function renderProdShell() {
    return renderShell({
        title: TITLE,
        favicon: '',
        head: "<?!= include('Stylesheet'); ?>",
        body: "<?!= include('JavaScript'); ?>",
    });
}

/** The page the local dev server serves out of frontend/dist. */
export function renderDevShell() {
    return renderShell({
        title: TITLE,
        favicon: devFaviconTag(),
        head: '',
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
        head: '',
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
 *   output — prod's bundle is inlined into src/JavaScript.html, so it comes
 *     back as a string; dev and demo write a file a server hands out.
 *
 * @param {'dev' | 'demo' | 'prod'} mode
 */
export function esbuildOptions(mode) {
    const optimized = mode !== 'dev';
    return {
        entryPoints: [
            path.join(
                root,
                mode === 'prod' ? 'frontend/src/react/main.tsx' : 'frontend/src/react/dev-main.tsx',
            ),
        ],
        bundle: true,
        // Everything runs inside one <script> in an Apps Script iframe, so
        // the bundle must declare nothing and leak nothing to global scope.
        format: 'iife',
        target: 'es2019',
        charset: 'utf8',
        logLevel: 'info',
        minify: optimized,
        // Minified output still carries readable function names, so a stack
        // trace from the deployed app stays diagnosable. Costs ~1% of size.
        keepNames: optimized,
        sourcemap: optimized ? false : 'inline',
        ...(mode === 'prod'
            ? { write: false, outfile: 'app.js' }
            : { outfile: path.join(mode === 'dev' ? distDir : siteDir, 'app.js') }),
    };
}
