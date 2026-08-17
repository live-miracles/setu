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
import { root, browserSafe, esbuildOptions, renderProdShell, compileCss } from './shell.mjs';

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

const inlineSafe = (text, tag) => text.replaceAll(`</${tag}`, `<\\/${tag}`);

writeFileSync(
    path.join(root, 'src/Stylesheet.html'),
    `<style>\n${inlineSafe(css, 'style')}\n</style>\n`,
);
writeFileSync(
    path.join(root, 'src/JavaScript.html'),
    `<script>\n${browserSafe(
        // Apps Script uses `?>` to terminate template scriptlets. Keep that
        // delimiter out of included third-party JavaScript, even though it is
        // valid inside a client-side regex/string.
        inlineSafe(js, 'script')
            .replaceAll('<!--', '\\x3c!--')
            .replaceAll('-->', '--\\x3e')
            .replaceAll('?>', '?\\x3e'),
    )}</script>\n`,
);
writeFileSync(path.join(root, 'src/Index.html'), renderProdShell());

console.log('Build complete: src/{Index.html,Stylesheet.html,JavaScript.html}');
