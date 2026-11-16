import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileCss } from './shell.mjs';

const outputDir = mkdtempSync(path.join(tmpdir(), 'setu-layout-'));
const outputFile = path.join(outputDir, 'app.css');

try {
    compileCss(outputFile);
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

    // Wide screens open the selected record in a pane beside the list; both
    // scroll on their own under the page heading.
    const hasDetailRule = css.match(/\.master-detail\.has-detail\{([^}]*)\}/)?.[1] || '';
    const listRule = css.match(/\.master-detail-list\{([^}]*)\}/)?.[1] || '';
    const paneRule = css.match(/\.master-detail-pane\{([^}]*)\}/)?.[1] || '';
    assert.match(hasDetailRule, /grid-template-columns:/, 'list and pane must share two columns');
    assert.match(listRule, /overflow-y:auto/, 'the list must scroll independently');
    const paneSectionsRule =
        css.match(/\.master-detail-pane \.detail-sections\{([^}]*)\}/)?.[1] || '';
    assert.match(paneRule, /overflow:hidden/, 'the pane scrolls under its heading');
    assert.doesNotMatch(css, /@container/, 'pane sections must stay in one column');
    assert.match(
        paneSectionsRule,
        /grid-template-columns:minmax\(0,1fr\)/,
        'pane sections must stack in one column',
    );
} finally {
    rmSync(outputDir, { recursive: true, force: true });
}
