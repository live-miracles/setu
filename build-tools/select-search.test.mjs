import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real kit Select to check which control a list gets.
const bundle = await build({
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
    stdin: {
        resolveDir: fileURLToPath(new URL('..', import.meta.url)),
        contents: "export { Select } from './frontend/src/ui/form-kit';",
    },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
);
const { Select } = module.exports;

const options = (count) =>
    Array.from({ length: count }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
const render = (props) => renderToStaticMarkup(createElement(Select, props));

test('long lists are searchable without asking', () => {
    const html = render({ options: options(7), value: 'v0' });
    assert.match(html, /role="combobox"/);
    assert.doesNotMatch(html, /<select/);
});

test('short lists stay a native select', () => {
    const html = render({ options: options(6), value: 'v0' });
    assert.match(html, /<select/);
    assert.doesNotMatch(html, /role="combobox"/);
});

test('a disabled placeholder option does not count towards the threshold', () => {
    const placeholder = { value: '', label: 'Select one', disabled: true };
    assert.match(render({ options: [placeholder, ...options(6)] }), /<select/);
    assert.match(render({ options: [placeholder, ...options(7)] }), /role="combobox"/);
});

test('showSearch overrides the default in both directions', () => {
    assert.match(render({ options: options(2), showSearch: true }), /role="combobox"/);
    assert.match(render({ options: options(20), showSearch: false }), /<select/);
});

test('children options are counted like the options prop', () => {
    const children = options(8).map((option) =>
        createElement(Select.Option, { key: option.value, value: option.value }, option.label),
    );
    assert.match(render({ children }), /role="combobox"/);
});

test('an unselected searchable list shows the placeholder option as a hint', () => {
    const html = render({
        value: '',
        options: [{ value: '', label: 'Select a department', disabled: true }, ...options(7)],
    });
    assert.match(html, /placeholder="Select a department"/);
});
