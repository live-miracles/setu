import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend/src');
const read = (relative) => readFileSync(path.join(frontend, relative), 'utf8');

function sourceFiles() {
    const files = [];
    for (const dir of ['sections', 'ui']) {
        for (const name of readdirSync(path.join(frontend, dir))) {
            if (name.endsWith('.tsx')) files.push(`${dir}/${name}`);
        }
    }
    return files;
}

// Every kit <Button ...> in a file: its attribute text and its text children
// (empty for a self-closing or icon-only button). The scan skips braces so an
// arrow function's `=>` inside an attribute is not mistaken for the tag's end.
function buttons(source) {
    const found = [];
    for (const match of source.matchAll(/<Button(?=[\s>])/g)) {
        let depth = 0;
        let end = match.index + '<Button'.length;
        for (; end < source.length; end++) {
            const char = source[end];
            if (char === '{') depth++;
            else if (char === '}') depth--;
            else if (char === '>' && depth === 0) break;
        }
        const attributes = source.slice(match.index, end);
        if (attributes.endsWith('/')) {
            found.push({ attributes, text: '' });
            continue;
        }
        const close = source.indexOf('</Button>', end);
        const children = source.slice(end + 1, close);
        // Text children only: drop nested elements and {expressions}.
        const text = children
            .replace(/<[^>]*>/g, '')
            .replace(/\{[^}]*\}/g, '')
            .trim();
        found.push({ attributes, text });
    }
    return found;
}

const all = sourceFiles().flatMap((file) =>
    buttons(read(file)).map((button) => ({ file, ...button })),
);

test('the scan finds the app buttons it checks', () => {
    assert.ok(all.length > 50, `only found ${all.length} buttons`);
    assert.ok(all.some((b) => /name="plus"/.test(b.attributes)));
});

test('add, edit and delete controls are icon-only and labelled for screen readers', () => {
    const iconControls = all.filter((b) =>
        /icon=\{<Icon name="(plus|edit|trash)"/.test(b.attributes),
    );
    assert.ok(iconControls.length > 10);
    for (const button of iconControls) {
        assert.equal(button.text, '', `${button.file}: icon control has a text label`);
        assert.match(
            button.attributes,
            /aria-label=/,
            `${button.file}: icon-only control needs an aria-label`,
        );
    }
});

test('duplicate and reschedule controls are text-only', () => {
    const textControls = all.filter((b) => /^(Duplicate|Reschedule)$/.test(b.text));
    assert.ok(textControls.length > 0);
    for (const button of textControls) {
        assert.doesNotMatch(
            button.attributes,
            /icon=/,
            `${button.file}: ${button.text} has an icon`,
        );
    }
});

test('workflow controls keep visible action labels and no icons', () => {
    const source = read('sections/detail-shared.tsx');
    assert.match(
        source,
        /onClick=\{\(\) => onAction\(action\)\}[\s\S]{0,80}>\s*\{action\}\s*<\/Button>/,
        'workflow controls should keep visible action labels',
    );
    assert.doesNotMatch(
        source,
        /function WorkflowActions[\s\S]{0,900}icon=\{icon\?\.\(action\)\}/,
        'workflow controls should not render icons',
    );
});
