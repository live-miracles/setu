// Production build: frontend/ -> the three files clasp pushes to Apps Script.
//
//   frontend/src/main.ts  --esbuild-->  src/JavaScript.html   (one <script>)
//   frontend/input.css    --tailwind->  src/Stylesheet.html   (one <style>)
//   frontend/shell.html   --template->  src/Index.html
//
// Apps Script has no module loader and serves the page as a single HTML
// document, so everything has to arrive inlined — esbuild's iife output is
// exactly that, and the old numeric filename prefixes that used to define
// concatenation order are now just the import graph.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, esbuildOptions, renderProdShell, compileCss } from './shell.mjs';

console.log('Bundling frontend TypeScript...');
const result = await esbuild.build(esbuildOptions('prod'));
const js = result.outputFiles[0].text;

console.log('Compiling Tailwind CSS...');
// Tailwind only writes to a file, but this CSS is destined for a <style> block
// rather than a route, so it goes to a scratch directory and gets read back.
const scratch = mkdtempSync(path.join(tmpdir(), 'setu-css-'));
const cssFile = path.join(scratch, 'app.css');
let css;
try {
    compileCss(cssFile);
    css = readFileSync(cssFile, 'utf8');
} finally {
    rmSync(scratch, { recursive: true, force: true });
}

// Both files are inlined into an HTML document, where the first literal
// `</script`/`</style` ends the block no matter what the surrounding JS or
// CSS syntax says — so a source file containing the string '</script>' would
// silently truncate the page. `<\/` is an equivalent escape in every context
// the sequence can legitimately appear in (JS strings and regexes, CSS
// strings), so this is safe to apply blindly.
const inlineSafe = (text, tag) => text.replaceAll(`</${tag}`, `<\\/${tag}`);

// Some QR/barcode dependencies contain ASCII control characters in string
// literals. Browsers reject those raw characters when this bundle is served
// inside an HTML script block, even though Node's parser accepts them. Escape
// them after bundling so Apps Script receives browser-valid JavaScript.
const browserSafe = (text) =>
    text.replace(
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
        (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );

writeFileSync(
    path.join(root, 'src/Stylesheet.html'),
    `<style>\n${inlineSafe(css, 'style')}\n</style>\n`,
);
writeFileSync(
    path.join(root, 'src/JavaScript.html'),
    `<script>\n${browserSafe(inlineSafe(js, 'script'))}</script>\n`,
);
writeFileSync(path.join(root, 'src/Index.html'), renderProdShell());

console.log('Build complete: src/{Index.html,Stylesheet.html,JavaScript.html}');
