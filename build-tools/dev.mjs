import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function spawnNamed(name, cmd, args) {
    const child = spawn(cmd, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
        console.log(`[${name}] exited with code ${code}`);
    });
    return child;
}

// Same shape as multi-lang-qa's dev server: tsc + Tailwind in watch mode,
// browser-sync serving frontend-src/ directly (its own index.html — a plain
// <script src> shell against the compiled ts/*.js and mock backend, never
// touched by build.mjs) with live reload. No clasp involvement for local dev.
spawnNamed('tsc', 'npx', [
    'tsc',
    '-p',
    'frontend-src/tsconfig.json',
    '--watch',
    '--preserveWatchOutput',
]);
spawnNamed('tailwind', 'npx', [
    '@tailwindcss/cli',
    '-i',
    'frontend-src/input.css',
    '-o',
    'frontend-src/output.css',
    '--watch',
]);
spawnNamed('browser-sync', 'npx', [
    'browser-sync',
    'start',
    '--server',
    'frontend-src',
    '--files',
    'frontend-src/ts/*.js,frontend-src/index.html,frontend-src/output.css',
    '--port',
    '3000',
    '--no-open',
    '--no-notify',
]);
