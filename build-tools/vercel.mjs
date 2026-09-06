// Top-level production build for Vercel. Unlike the old Apps Script shell it
// emits a normal document, so browser APIs such as camera and PWA install are
// available to the application.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { root, compileCss, esbuildOptions, renderShell } from './shell.mjs';

const webDir = path.join(root, 'web');
const supabaseUrl = process.env.SETU_SUPABASE_URL || '';
const supabasePublishableKey = process.env.SETU_SUPABASE_PUBLISHABLE_KEY || '';

rmSync(webDir, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });

await esbuild.build({
    ...esbuildOptions('prod'),
    write: true,
    outfile: path.join(webDir, 'app.js'),
    define: {
        __SETU_SUPABASE_URL__: JSON.stringify(supabaseUrl),
        __SETU_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
    },
});
compileCss(path.join(webDir, 'app.css'));
cpSync(path.join(root, 'frontend/icons'), path.join(webDir, 'icons'), { recursive: true });
cpSync(path.join(root, 'frontend/manifest.webmanifest'), path.join(webDir, 'manifest.webmanifest'));
cpSync(path.join(root, 'frontend/sw.js'), path.join(webDir, 'sw.js'));
writeFileSync(
    path.join(webDir, 'index.html'),
    renderShell({
        title: 'Setu',
        favicon: '<link rel="icon" type="image/png" href="/icons/icon-192.png" />',
        head: '<link rel="stylesheet" href="/app.css" />',
        body: '<script src="/app.js"></script>',
    }),
);

console.log('Vercel build complete: web/');
