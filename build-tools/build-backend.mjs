import { cpSync, mkdirSync, rmSync } from 'node:fs';
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
console.log('Apps Script build complete: .clasp-build/{*.js,appsscript.json}');
