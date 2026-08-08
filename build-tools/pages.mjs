// Public-site build: frontend/ -> site/, the directory CI force-pushes to the
// gh-pages branch on every push to master (.github/workflows/pages.yml).
//
// The site carries two things:
//
//   index.html + app.js         the demo — the production UI built against the
//     in-memory mock backend, so anyone can click through the whole app with
//     no Google account, no Sheet, and nothing real behind it. It is the same
//     bundle `npm run dev` serves, minified; mock/backend.ts is reachable only
//     from react/dev-main.tsx, so this is the one build where that is the intent.
//   icons/                      the app icon, hosted. Apps Script serves the
//     real app in an iframe and setFaviconUrl() takes a URL rather than a data
//     URI, so the icon has to be public somewhere; this is that somewhere (see
//     FAVICON_URL in src/Code.ts). Which is also why the whole directory gets
//     copied rather than just the file the shell links: the icon set is the
//     unit that is published, and a hand-maintained list here would drift.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, siteDir, esbuildOptions, renderDemoShell } from './shell.mjs';

// Rebuilt from empty, because the branch is replaced rather than updated: a
// file that stops being generated has to stop being published too.
rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });

console.log('Bundling frontend TypeScript (mock backend)...');
await esbuild.build(esbuildOptions('demo'));

cpSync(path.join(root, 'frontend/icons'), path.join(siteDir, 'icons'), { recursive: true });
writeFileSync(path.join(siteDir, 'index.html'), renderDemoShell());

// Pages runs everything it serves through Jekyll unless told not to. Nothing
// here is Jekyll input, and its one visible behaviour on a directory like this
// would be to silently drop any future file whose name starts with `_`.
writeFileSync(path.join(siteDir, '.nojekyll'), '');

console.log(`Site built in ${path.relative(root, siteDir)}/`);
