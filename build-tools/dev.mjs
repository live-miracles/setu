// Dev server: esbuild + Tailwind in watch mode, browser-sync serving
// frontend/dist on http://localhost:3000 with live reload. No clasp, no
// Google account, no Sheet — the entry point is frontend/src/dev.ts, which
// pulls in the in-memory mock backend in place of google.script.run.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, distDir, esbuildOptions, renderDevShell, TAILWIND_ARGS } from './shell.mjs';

mkdirSync(distDir, { recursive: true });
writeFileSync(path.join(distDir, 'index.html'), renderDevShell());

function spawnNamed(name, cmd, args) {
    const child = spawn(cmd, args, {
        cwd: root,
        // No stdin: nothing here reads it, and handing children a closed one
        // makes them quit (see --watch=always below).
        stdio: ['ignore', 'inherit', 'inherit'],
        shell: process.platform === 'win32',
    });
    child.on('exit', (code) => console.log(`[${name}] exited with code ${code}`));
    return child;
}

const ctx = await esbuild.context(esbuildOptions('dev'));
await ctx.watch();

// `--watch=always` rather than `--watch`: plain --watch stops the moment
// stdin closes, which silently kills CSS rebuilds any time `npm run dev`
// isn't attached to a live terminal.
spawnNamed('tailwind', 'npx', TAILWIND_ARGS(path.join(distDir, 'app.css'), ['--watch=always']));

// Watching dist/ rather than the sources means a reload fires once the
// rebuilt asset is actually on disk, and covers CSS-only edits too.
spawnNamed('browser-sync', 'npx', [
    'browser-sync',
    'start',
    '--server',
    'frontend/dist',
    '--files',
    'frontend/dist/**',
    '--port',
    '3000',
    '--no-open',
    '--no-notify',
]);
