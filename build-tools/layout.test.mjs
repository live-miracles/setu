import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = mkdtempSync(path.join(tmpdir(), 'setu-layout-'));
const outputFile = path.join(outputDir, 'app.css');

try {
    execFileSync(
        path.join(root, 'node_modules/.bin/tailwindcss'),
        ['-i', path.join(root, 'frontend/input.css'), '-o', outputFile, '--minify'],
        { cwd: root, stdio: 'ignore' },
    );
    const css = readFileSync(outputFile, 'utf8');
    const appContentRule = css.match(/\.app-content\{([^}]*)\}/)?.[1] || '';

    const settingsRule = css.match(/\.app-content\.app-content-settings\{([^}]*)\}/)?.[1] || '';

    assert.match(appContentRule, /max-width:100%/, 'app-content must stay viewport-constrained');
    assert.match(
        settingsRule,
        /max-width:50rem/,
        'settings must have a more specific max-width constraint',
    );
} finally {
    rmSync(outputDir, { recursive: true, force: true });
}
