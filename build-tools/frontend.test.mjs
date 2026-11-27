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
                import { runActivityEventAssertions } from './frontend/src/ui/activity-events.test.ts';
                import { runAppUpdateAssertions } from './frontend/src/ui/app-update.test.ts';
                import { runCalendarTableAssertions } from './frontend/src/ui/calendar-table.test.ts';
                import { runCreateRecordAssertions } from './frontend/src/ui/create-record.test.ts';
                import { runInventoryImageAssertions } from './frontend/src/ui/inventory-image.test.ts';
                import { runInventoryItemsAssertions } from './frontend/src/ui/inventory-items.test.ts';
                import { runInventoryQrPdfAssertions } from './frontend/src/ui/inventory-qr-pdf.test.ts';
                import { runInventoryQrAssertions } from './frontend/src/ui/inventory-qr.test.ts';
                import { runInventoryStatusAssertions } from './frontend/src/ui/inventory-status.test.ts';
                import { runInventoryStockAssertions } from './frontend/src/ui/inventory-stock.test.ts';
                import { runProgramActionAssertions } from './frontend/src/ui/program-actions.test.ts';
                import { runRequestFieldsAssertions } from './frontend/src/ui/request-fields.test.ts';
                import { runRequestKindAssertions } from './frontend/src/ui/request-kind.test.ts';
                import { runRosterTableAssertions } from './frontend/src/ui/roster-table.test.ts';
                import { runSortableAssertions } from './frontend/src/ui/sortable.test.ts';
                import { runToneAssertions } from './frontend/src/ui/tone.test.ts';
                import { runViewsAssertions } from './frontend/src/ui/views.test.ts';
                import { runFormUtilsAssertions } from './frontend/src/sections/form-utils.test.ts';
                import { runRequestDetailAssertions } from './frontend/src/sections/request-detail.test.ts';

                runActivityEventAssertions();
                runAppUpdateAssertions();
                runCalendarTableAssertions();
                runCreateRecordAssertions();
                runInventoryImageAssertions();
                runInventoryItemsAssertions();
                runInventoryQrPdfAssertions();
                runInventoryQrAssertions();
                runInventoryStatusAssertions();
                runInventoryStockAssertions();
                runProgramActionAssertions();
                runRequestFieldsAssertions();
                runRequestKindAssertions();
                runRosterTableAssertions();
                runSortableAssertions();
                runToneAssertions();
                runViewsAssertions();
                runFormUtilsAssertions();
                runRequestDetailAssertions();
            `,
        },
    });

    await import(
        `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
    );
});
