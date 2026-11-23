import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createFormControl } from 'react-hook-form';

// Render the real TextField and exercise its handlers with the real form library.
// Only the UI shell is replaced so this regression runs without a browser.
const bundle = await build({
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
    stdin: {
        resolveDir: fileURLToPath(new URL('..', import.meta.url)),
        contents: `
            export { TextField } from './frontend/src/sections/refine-shared';
            export { internationalPhoneRules } from './frontend/src/sections/form-utils';
            export { captured } from './frontend/src/ui/form-kit';
        `,
    },
    plugins: [
        {
            name: 'input-shell',
            setup(build) {
                const stubs = {
                    'form-kit': `
                        export const captured = new Map();
                        export function Input(props) { captured.set(props.name, props); return null; }
                        export function Field({ children }) { return children; }
                        export function Select() { return null; }
                    `,
                    kit: `
                        export const Button = () => null;
                        export const Card = () => null;
                        export const Empty = () => null;
                        export const Typography = {};
                    `,
                    'overlay-kit': 'export const Modal = () => null;',
                };
                for (const [name, contents] of Object.entries(stubs)) {
                    build.onResolve({ filter: new RegExp(`/ui/${name}$`) }, () => ({
                        path: name,
                        namespace: `stub-${name}`,
                    }));
                    build.onLoad({ filter: /.*/, namespace: `stub-${name}` }, () => ({ contents }));
                }
                build.onResolve({ filter: /\/ui\/feedback$/ }, () => ({
                    path: 'feedback',
                    namespace: 'feedback',
                }));
                build.onLoad({ filter: /.*/, namespace: 'feedback' }, () => ({
                    contents: 'export function showErrorAlert() {}',
                }));
            },
        },
    ],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
);
const { TextField, internationalPhoneRules, captured } = module.exports;

for (const initial of ['', '+12025550100']) {
    test(`registered contact inputs submit edited values (initial ${initial || 'empty'})`, async () => {
        const form = createFormControl({ defaultValues: { phone: initial, whatsapp: initial } });
        const inputs = {};
        for (const [name, label] of [
            ['phone', 'Phone'],
            ['whatsapp', 'WhatsApp'],
        ]) {
            renderToStaticMarkup(
                createElement(TextField, {
                    name,
                    label,
                    type: 'tel',
                    value: initial,
                    required: true,
                    registration: form.register(name, internationalPhoneRules(label)),
                }),
            );
            const props = captured.get(name);
            const input = { name, type: 'tel', value: initial, focus() {} };
            // The kit Input hands react-hook-form the native input element.
            props.ref(input);
            inputs[name] = { props, input };
            input.value = '+12025550101';
            await props.onChange({ target: input, type: 'change' });
        }
        let submitted;
        await form.handleSubmit((values) => {
            submitted = values;
        })();
        assert.deepEqual(submitted, { phone: '+12025550101', whatsapp: '+12025550101' });

        for (const { input, props } of Object.values(inputs)) {
            input.value = '';
            await props.onChange({ target: input, type: 'change' });
        }
        let errors;
        await form.handleSubmit(
            () => assert.fail('Empty contacts must fail'),
            (value) => {
                errors = value;
            },
        )();
        assert.equal(errors.phone.message, 'Phone is required');
        assert.equal(errors.whatsapp.message, 'WhatsApp is required');

        for (const { input, props } of Object.values(inputs)) {
            input.value = 'invalid';
            await props.onChange({ target: input, type: 'change' });
        }
        await form.handleSubmit(
            () => assert.fail('Invalid contacts must fail'),
            (value) => {
                errors = value;
            },
        )();
        assert.equal(errors.phone.type, 'pattern');
        assert.equal(errors.whatsapp.type, 'pattern');
    });
}
