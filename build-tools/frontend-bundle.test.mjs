import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('src/JavaScript.html', 'utf8');
const script = html.slice(
    html.indexOf('<script>') + '<script>'.length,
    html.lastIndexOf('</script>'),
);

assert.doesNotMatch(script, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
new Function(script);
