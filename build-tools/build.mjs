// Production build: frontend/ -> the three files clasp pushes to Apps Script.
//
//   frontend/src/react/main.tsx --esbuild--> src/JavaScript.html (one <script>)
//   frontend/shell.html   --template->  src/Index.html
//
// Apps Script has no module loader and serves the page as a single HTML
// document, so everything has to arrive inlined — esbuild's iife output is
// exactly that, and the old numeric filename prefixes that used to define
// concatenation order are now just the import graph.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, esbuildOptions, renderProdShell } from './shell.mjs';

console.log('Bundling frontend TypeScript...');
const result = await esbuild.build(esbuildOptions('prod'));
const js = result.outputFiles[0].text;

// Both files are inlined into an HTML document, where the first literal
// `</script`/`</style` ends the block no matter what the surrounding JS or
// CSS syntax says — so a source file containing the string '</script>' would
// silently truncate the page. `<\/` is an equivalent escape in every context
// the sequence can legitimately appear in (JS strings and regexes, CSS
// strings), so this is safe to apply blindly.
const inlineSafe = (text, tag) => text.replaceAll(`</${tag}`, `<\\/${tag}`);

writeFileSync(
    path.join(root, 'src/Stylesheet.html'),
    '<style>\n/* Material UI injects its styles at runtime. */\n</style>\n',
);
writeFileSync(
    path.join(root, 'src/JavaScript.html'),
    `<script>\n${inlineSafe(js, 'script')}</script>\n`,
);
writeFileSync(path.join(root, 'src/Index.html'), renderProdShell());

console.log('Build complete: src/{Index.html,Stylesheet.html,JavaScript.html}');
