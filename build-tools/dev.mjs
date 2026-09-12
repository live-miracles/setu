// Dev server: esbuild + Tailwind in watch mode behind a static file server
// on http://localhost:3000. It runs the same Supabase-backed frontend as
// Vercel; configure local or development-project credentials in .env.local.
//
// Builds are automatic; the page is not. Reload the tab yourself once the
// rebuild logs — that trade buys a server with no watcher of its own, no
// injected client script, and nothing to get wedged between edits.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import {
    root,
    distDir,
    esbuildOptions,
    renderInlineDevShell,
    TAILWIND_BIN,
    TAILWIND_ARGS,
} from './shell.mjs';

const supabaseUrl = process.env.SETU_SUPABASE_URL || '';
const supabasePublishableKey = process.env.SETU_SUPABASE_PUBLISHABLE_KEY || '';
if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
        'Missing SETU_SUPABASE_URL or SETU_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and configure a Supabase development project.',
    );
}

// `PORT=3001 npm run dev` when something else already holds the default.
const PORT = Number(process.env.PORT) || 3000;

mkdirSync(distDir, { recursive: true });

// Re-rendered per request from frontend/shell.html, and never written to
// frontend/dist. The page used to be a file written into dist at startup and
// read back per request, so anything that cleared dist mid-session — and only
// esbuild recreates what it owns — left every request 404ing until the whole
// server was restarted. Rendering here costs one small read and three string
// replaces, and buys shell.html edits that show up on reload like any other.

const CONTENT_TYPES = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// These assets are tracked frontend files rather than watcher outputs, but
// the local app references them from the site root just like the production
// build does. Keep the list explicit so arbitrary files under frontend/ are
// never exposed by the dev server.
const STATIC_ASSETS = new Map([
    ['/manifest.webmanifest', path.join(root, 'frontend/manifest.webmanifest')],
    ['/sw.js', path.join(root, 'frontend/sw.js')],
    ['/icons/icon-192.png', path.join(root, 'frontend/icons/icon-192.png')],
    ['/icons/icon-512.png', path.join(root, 'frontend/icons/icon-512.png')],
]);

// The only paths the watchers actually produce. Browsers speculatively ask
// for plenty this server will never have — /favicon.ico and Chrome DevTools'
// /.well-known/ handshake, for example — and a 404 for those is the correct
// answer, not a problem worth a line in the log.
const BUILT_ASSETS = new Set(['/app.js', '/app.css']);

// Renders the same shell for '/' and for any path-based client route
// (/inventory/123, /departments, ...) that isn't a real static file — this is
// the dev-server equivalent of vercel.json's SPA catch-all rewrite, needed
// now that React Router owns path-based routes instead of a `?section=`
// query param that always resolved to '/'.
function serveShell(res) {
    let page;
    try {
        page = renderInlineDevShell({
            script: readFileSync(path.join(distDir, 'app.js'), 'utf8'),
            style: readFileSync(path.join(distDir, 'app.css'), 'utf8'),
        });
    } catch (err) {
        // shell.html is a tracked source file rather than a build output,
        // so this is a genuine mistake worth showing in the tab instead of
        // taking the server down mid-session.
        console.error(`[server] cannot render shell.html: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(`${err.message}\n`);
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
}

const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

    // Both assets are rewritten in place by the watchers, so a cached copy is
    // always the stale one — a manual reload has to actually refetch them.
    res.setHeader('Cache-Control', 'no-store');

    if (pathname === '/') {
        serveShell(res);
        return;
    }

    const staticAsset = STATIC_ASSETS.get(pathname);
    if (staticAsset) {
        try {
            const body = readFileSync(staticAsset);
            res.writeHead(200, {
                'Content-Type':
                    CONTENT_TYPES[path.extname(staticAsset)] ?? 'application/octet-stream',
            });
            res.end(body);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found: ${pathname}\n`);
        }
        return;
    }

    const file = path.join(distDir, path.normalize(pathname));
    if (!file.startsWith(distDir + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
        return;
    }

    let body;
    try {
        body = readFileSync(file);
    } catch {
        // A miss on an asset the watchers own means the first build of it
        // hasn't landed yet, which is worth saying out loud; the next reload
        // picks it up.
        if (BUILT_ASSETS.has(pathname)) {
            console.warn(`[server] 404 ${pathname} — not built yet, reload once it appears`);
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found: ${pathname}\n`);
            return;
        }
        // Anything else with no matching file is a client-side route (e.g.
        // /inventory/123) rather than a missing asset — hand it the same
        // shell React Router will read the path from, mirroring vercel.json's
        // catch-all rewrite.
        serveShell(res);
        return;
    }

    res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
    res.end(body);
});

server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(
        `[server] port ${PORT} is in use — an earlier dev server is probably still running.`,
    );
    process.exit(1);
});

server.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));

const ctx = await esbuild.context({
    ...esbuildOptions('dev'),
    define: {
        __SETU_SUPABASE_URL__: JSON.stringify(supabaseUrl),
        __SETU_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
    },
});
await ctx.watch();

// `--watch=always` rather than `--watch`: plain --watch stops the moment
// stdin closes, which silently kills CSS rebuilds any time `npm run dev`
// isn't attached to a live terminal.
const tailwind = spawn(
    TAILWIND_BIN,
    TAILWIND_ARGS(path.join(distDir, 'app.css'), ['--watch=always']),
    {
        cwd: root,
        // No stdin: nothing here reads it, and handing children a closed one
        // makes them quit (see --watch=always above).
        stdio: ['ignore', 'inherit', 'inherit'],
    },
);
tailwind.on('exit', (code) => console.log(`[tailwind] exited with code ${code}`));

// Ctrl-C already reaches the child through the shared process group; this is
// for every other way this process ends, so a watcher can't survive it and
// then hold the port or the CSS output against the next run.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
        tailwind.kill();
        void ctx.dispose();
        server.close();
        process.exit(0);
    });
}
