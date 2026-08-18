// Production build: validate frontend/ and generate the small HTML shell that
// Apps Script pushes. The production JS and CSS are published by pages.mjs.
//
//   frontend/src/main.ts  --esbuild-->  production asset (GitHub Pages)
//   frontend/input.css    --tailwind->  production asset (GitHub Pages)
//   frontend/shell.html   --template->  src/Index.html
//
// Apps Script has no module loader and serves the page as a single HTML
// document, so everything has to arrive inlined — esbuild's iife output is
// exactly that, and the old numeric filename prefixes that used to define
// concatenation order are now just the import graph.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, esbuildOptions, renderInlineProdShell, compileCss } from './shell.mjs';

console.log('Bundling frontend TypeScript...');
const frontendBuild = await esbuild.build(esbuildOptions('prod'));
const script = frontendBuild.outputFiles?.[0]?.text;
if (!script) throw new Error('Frontend bundle did not produce JavaScript output.');

const stylesheetPath = path.join(root, 'src/Stylesheet.html');
console.log('Compiling frontend CSS...');
compileCss(stylesheetPath);
const style = readFileSync(stylesheetPath, 'utf8');

rmSync(path.join(root, 'src/Stylesheet.html'), { force: true });
rmSync(path.join(root, 'src/JavaScript.html'), { force: true });
writeFileSync(path.join(root, 'src/Index.html'), renderInlineProdShell({ script, style }));

console.log('Build complete: src/Index.html (embedded production assets)');
