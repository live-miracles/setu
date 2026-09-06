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
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, esbuildOptions, renderProdShell } from './shell.mjs';

console.log('Bundling frontend TypeScript...');
await esbuild.build(esbuildOptions('prod'));
rmSync(path.join(root, 'src/Stylesheet.html'), { force: true });
rmSync(path.join(root, 'src/JavaScript.html'), { force: true });
writeFileSync(path.join(root, 'src/Index.html'), renderProdShell());

console.log('Legacy shell build complete: src/Index.html');
