// Regenerates the README screenshots in docs/images/ from the demo server
// (demo.mjs), so they only ever show the fictional demo data. Needs a local
// Chrome; set CHROME_PATH if it is not in a standard location.
//
//   npm run screenshots
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from './shell.mjs';

const PORT = 47196;
const ORIGIN = `http://localhost:${PORT}`;
const outDir = path.join(root, 'docs/images');

// name, route, viewport width x height, device scale factor
const SHOTS = [
    ['program-detail', '/programs/pr-1', 1440, 760, 1.5],
    ['roster', '/roster', 1440, 720, 1.5],
];

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
    ];
    const found = candidates.find((candidate) => candidate && existsSync(candidate));
    if (!found) throw new Error('Chrome not found. Set CHROME_PATH to its executable.');
    return found;
}

async function waitForServer() {
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            await fetch(ORIGIN);
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    throw new Error('The demo server did not start.');
}

const chrome = findChrome();
mkdirSync(outDir, { recursive: true });
const server = spawn(process.execPath, [path.join(root, 'build-tools/demo.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'inherit', 'inherit'],
});

try {
    await waitForServer();
    const profile = mkdtempSync(path.join(tmpdir(), 'setu-shots-'));
    for (const [name, route, width, height, scale] of SHOTS) {
        const file = path.join(outDir, `${name}.png`);
        const result = spawnSync(
            chrome,
            [
                '--headless=new',
                '--disable-gpu',
                '--hide-scrollbars',
                `--user-data-dir=${profile}`,
                `--window-size=${width},${height}`,
                `--force-device-scale-factor=${scale}`,
                '--virtual-time-budget=8000',
                `--screenshot=${file}`,
                `${ORIGIN}${route}`,
            ],
            { stdio: 'ignore' },
        );
        if (result.status !== 0) throw new Error(`Chrome failed for ${name}`);
        console.log(`[screenshots] ${path.relative(root, file)}`);
    }
    rmSync(profile, { recursive: true, force: true });
} finally {
    server.kill();
}
