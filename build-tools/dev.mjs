// Dev server: esbuild watch mode behind a static file server
// on http://localhost:3000. No clasp, no Google account, no Sheet — the entry
// point is frontend/src/react/dev-main.tsx, which pulls in the in-memory mock backend in
// place of google.script.run.
//
// Builds are automatic; the page is not. Reload the tab yourself once the
// rebuild logs — that trade buys a server with no watcher of its own, no
// injected client script, and nothing to get wedged between edits.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import {
    root,
    distDir,
    esbuildOptions,
    renderDevShell,
} from './shell.mjs';

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
};

// The only paths the watchers actually produce. Browsers speculatively ask
// for plenty this server will never have — /favicon.ico, Chrome DevTools'
// /.well-known/ handshake, /sw.js if any project ever registered a service
// worker on this port — and a 404 for those is the correct answer, not a
// problem worth a line in the log.
const BUILT_ASSETS = new Set(['/app.js']);

const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

    // Both assets are rewritten in place by the watchers, so a cached copy is
    // always the stale one — a manual reload has to actually refetch them.
    res.setHeader('Cache-Control', 'no-store');

    if (pathname === '/') {
        let page;
        try {
            page = renderDevShell();
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
        // picks it up. Everything else is routine browser probing.
        if (BUILT_ASSETS.has(pathname)) {
            console.warn(`[server] 404 ${pathname} — not built yet, reload once it appears`);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found: ${pathname}\n`);
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

const ctx = await esbuild.context(esbuildOptions('dev'));
await ctx.watch();

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
        void ctx.dispose();
        server.close();
        process.exit(0);
    });
}
