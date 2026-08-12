import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('frontend/src/ui/qr-scanner.tsx', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

assert.match(source, /BarcodeDetector/);
assert.doesNotMatch(source, /html5-qrcode|Html5Qrcode/);
assert.doesNotMatch(packageJson, /html5-qrcode/);
