import test from 'node:test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('frontend utility and table assertions', async () => {
    const bundle = await build({
        bundle: true,
        format: 'esm',
        platform: 'node',
        write: false,
        stdin: {
            resolveDir: root,
            sourcefile: 'frontend-assertions.ts',
            contents: `
                import { runCalendarTableAssertions } from './frontend/src/ui/calendar-table.test.ts';
                import { runCreateRecordAssertions } from './frontend/src/ui/create-record.test.ts';
                import { runInventoryImageAssertions } from './frontend/src/ui/inventory-image.test.ts';
                import { runInventoryQrAssertions } from './frontend/src/ui/inventory-qr.test.ts';
                import { runInventoryStockAssertions } from './frontend/src/ui/inventory-stock.test.ts';
                import { runProgramActionAssertions } from './frontend/src/ui/program-actions.test.ts';
                import { runRosterTableAssertions } from './frontend/src/ui/roster-table.test.ts';

                runCalendarTableAssertions();
                runCreateRecordAssertions();
                runInventoryImageAssertions();
                runInventoryQrAssertions();
                runInventoryStockAssertions();
                runProgramActionAssertions();
                runRosterTableAssertions();
            `,
        },
    });

    await import(
        `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
    );
});
