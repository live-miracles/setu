import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Load order for the concatenated frontend bundle. 01-mock-backend.ts is
// deliberately excluded — it's dev-only and must never ship.
const FRONTEND_TS_ORDER = [
    '00-config.ts',
    '02-api.ts',
    '03-state.ts',
    '04-render-shared.ts',
    '11-workflows.ts',
    '05-render-home.ts',
    '06-render-roster.ts',
    '07-render-inventory.ts',
    '13-render-programs.ts',
    '08-render-tickets.ts',
    '09-render-profile.ts',
    '10-render-admin.ts',
    '12-main.ts',
];

function run(cmd) {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
}

console.log('Compiling frontend TypeScript...');
run('npx tsc -p frontend-src/tsconfig.json');

console.log('Compiling Tailwind CSS...');
run('npx @tailwindcss/cli -i frontend-src/input.css -o frontend-src/output.css --minify');

const css = readFileSync(path.join(root, 'frontend-src/output.css'), 'utf8');
writeFileSync(path.join(root, 'src/Stylesheet.html'), `<style>\n${css}\n</style>\n`);

const jsChunks = FRONTEND_TS_ORDER.map((tsFile) => {
    const jsFile = tsFile.replace(/\.ts$/, '.js');
    return readFileSync(path.join(root, 'frontend-src/ts', jsFile), 'utf8');
});
writeFileSync(
    path.join(root, 'src/JavaScript.html'),
    `<script>\n${jsChunks.join('\n')}\n</script>\n`,
);

copyFileSync(
    path.join(root, 'frontend-src/index.template.html'),
    path.join(root, 'src/Index.html'),
);

console.log('Build complete: src/{Index.html,Stylesheet.html,JavaScript.html}');
