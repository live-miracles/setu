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
    const detailMainRule = css.match(/\.detail-main\{([^}]*)\}/)?.[1] || '';
    const imageFrameRule = css.match(/\.inventory-request-image-frame\{([^}]*)\}/)?.[1] || '';
    const imageRule = css.match(/\.inventory-request-image\{([^}]*)\}/)?.[1] || '';

    assert.match(appContentRule, /max-width:100%/, 'app-content must stay viewport-constrained');
    assert.match(
        settingsRule,
        /max-width:50rem/,
        'settings must have a more specific max-width constraint',
    );
    assert.match(detailMainRule, /overflow-y:auto/, 'detail main column must scroll vertically');
    assert.match(imageFrameRule, /width:240px/, 'inventory image frame must stay compact in width');
    assert.match(
        imageFrameRule,
        /height:240px/,
        'inventory image frame must stay square in height',
    );
    assert.match(imageFrameRule, /margin-inline:auto/, 'inventory image frame must be centered');
    assert.match(imageRule, /max-height:100%/, 'inventory image must fit the compact frame');
} finally {
    rmSync(outputDir, { recursive: true, force: true });
}
