import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { devFaviconTag, root } from './shell.mjs';

const outputDir = path.join(root, '.inline-repro');
const indexFile = path.join(outputDir, 'index.html');

execFileSync(process.execPath, ['build-tools/build.mjs'], {
    cwd: root,
    stdio: 'inherit',
});

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const template = readFileSync(path.join(root, 'src/Index.html'), 'utf8');
const stylesheet = readFileSync(path.join(root, 'src/Stylesheet.html'), 'utf8');
const javascript = readFileSync(path.join(root, 'src/JavaScript.html'), 'utf8');
// Use function replacers: a replacement string interprets `$&`, `$1`, etc.
// as special substitution patterns. Minified dependencies legitimately contain
// `$&`, which would otherwise put the Apps Script include marker back into the
// generated JavaScript and make the browser parse `<` as JS.
const html = template
    .replace("<?!= include('Stylesheet'); ?>", () => stylesheet)
    .replace("<?!= include('JavaScript'); ?>", () => javascript)
    .replace('<!--#FAVICON#-->', devFaviconTag());
writeFileSync(indexFile, html);

const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') {
        response.writeHead(204).end();
        return;
    }
    if (request.url !== '/' && request.url !== '/index.html') {
        response.writeHead(404).end();
        return;
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(readFileSync(indexFile));
});

server.listen(4173, '127.0.0.1', () => {
    console.log('Inline Apps Script HTML fixture: http://localhost:4173');
    console.log('Press Ctrl-C to stop.');
});
