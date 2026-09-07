// Transitional Apps Script shell build. The Vercel application is built by
// vercel.mjs; this preserves the legacy deployment pipeline while its backend
// migration is completed.
//
//   frontend/shell.html   --template->  src/Index.html
//
// Apps Script has no module loader and serves the page as a single HTML
// document, so everything has to arrive inlined — esbuild's iife output is
// exactly that, and the old numeric filename prefixes that used to define
// concatenation order are now just the import graph.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, compileCss, esbuildOptions, renderInlineProdShell } from './shell.mjs';

console.log('Bundling frontend TypeScript...');
const javascript = await esbuild.build(esbuildOptions('prod'));
const stylesheetPath = path.join(root, 'src/Stylesheet.html');

compileCss(stylesheetPath);
writeFileSync(
    path.join(root, 'src', 'Index.html'),
    renderInlineProdShell({
        script: javascript.outputFiles[0].text,
        style: readFileSync(stylesheetPath, 'utf8'),
    }),
);
rmSync(stylesheetPath, { force: true });
rmSync(path.join(root, 'src/JavaScript.html'), { force: true });

console.log('Legacy shell build complete: src/Index.html (assets inlined)');
