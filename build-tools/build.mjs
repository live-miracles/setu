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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, esbuildOptions, renderProdShell, TAILWIND_ARGS } from './shell.mjs';

console.log('Bundling frontend TypeScript...');
const result = await esbuild.build(esbuildOptions('prod'));
const js = result.outputFiles[0].text;

console.log('Compiling Tailwind CSS...');
const scratch = mkdtempSync(path.join(tmpdir(), 'setu-css-'));
const cssFile = path.join(scratch, 'app.css');
let css;
try {
    execFileSync('npx', TAILWIND_ARGS(cssFile, ['--minify']), { cwd: root, stdio: 'inherit' });
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

writeFileSync(
    path.join(root, 'src/Stylesheet.html'),
    `<style>\n${inlineSafe(css, 'style')}\n</style>\n`,
);
writeFileSync(
    path.join(root, 'src/JavaScript.html'),
    `<script>\n${inlineSafe(js, 'script')}</script>\n`,
);
writeFileSync(path.join(root, 'src/Index.html'), renderProdShell());

console.log('Build complete: src/{Index.html,Stylesheet.html,JavaScript.html}');
