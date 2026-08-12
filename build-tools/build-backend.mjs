import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.clasp-build');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

execFileSync(path.join(root, 'node_modules', '.bin', 'tsc'), ['-p', 'src/tsconfig.deploy.json'], {
    cwd: root,
    stdio: 'inherit',
});

cpSync(path.join(root, 'src', 'appsscript.json'), path.join(output, 'appsscript.json'));
for (const filename of readdirSync(path.join(root, 'src'))) {
    if (filename.endsWith('.html')) {
        cpSync(path.join(root, 'src', filename), path.join(output, filename));
    }
}

console.log('Backend build complete: .clasp-build/{*.js,*.html,appsscript.json}');
