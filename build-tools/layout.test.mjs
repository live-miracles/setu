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

    const settingsRule = css.match(/\.app-content-settings[^}]*\{([^}]*)\}/)?.[1] || '';
    const detailSectionRule = css.match(/\.detail-section\{([^}]*)\}/)?.[1] || '';
    const imageFrameRule = css.match(/\.inventory-request-image-frame\{([^}]*)\}/)?.[1] || '';
    const imageRule = css.match(/\.inventory-request-image\{([^}]*)\}/)?.[1] || '';

    assert.match(appContentRule, /max-width:100%/, 'app-content must stay viewport-constrained');
    assert.match(
        settingsRule,
        /max-width:50rem/,
        'settings must have a more specific max-width constraint',
    );
    assert.match(detailSectionRule, /overflow:auto/, 'detail sections must scroll independently');
    assert.match(imageFrameRule, /width:100%/, 'inventory image frame must fill its card');
    assert.match(imageFrameRule, /min-height:0/, 'inventory image frame must remain shrinkable');
    assert.match(
        imageFrameRule,
        /justify-content:center/,
        'inventory image frame must center content',
    );
    assert.match(imageRule, /height:100%/, 'inventory image must fill the frame');
} finally {
    rmSync(outputDir, { recursive: true, force: true });
}
