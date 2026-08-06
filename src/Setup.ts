// One-time bootstrap functions. Not exposed to the frontend — run manually
// from the Apps Script editor (select the function, click Run) after the
// first `clasp push`. Both are idempotent, safe to re-run after future pushes.

const CURRENT_SCHEMA_VERSION = '2';

interface SchemaMigrationReport {
    backupFileId: string;
    schemaVersion: string;
    recordCounts: Record<string, number>;
}

function setupSheets(): void {
    const ss = SpreadsheetApp.openById(getSpreadsheetId());

    Object.values(Tables).forEach((table) => {
        ensureTabWithHeaders(ss, table.tabName, table.headers as string[]);
    });

    removeDefaultSheetIfEmpty(ss);
    writeSchemaVersion();
}

function ensureTabWithHeaders(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    tabName: string,
    headers: string[],
): void {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
        sheet = ss.insertSheet(tabName);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
        const lastColumn = sheet.getLastColumn();
        const existingHeaders =
            lastColumn > 0 ? (sheet.getRange(1, 1, 1, lastColumn).getValues()[0] as string[]) : [];
        const populatedHeaders = existingHeaders.filter(
            (header) => String(header || '').length > 0,
        );

        // Schema changes are append-only. Reordering or overwriting an existing
        // heading would reinterpret historical cells, so fail loudly instead.
        populatedHeaders.forEach((header, index) => {
            if (headers[index] !== header) {
                throw new Error(
                    'Unsafe schema mismatch in ' +
                        tabName +
                        ' at column ' +
                        (index + 1) +
                        ': expected "' +
                        headers[index] +
                        '", found "' +
                        header +
                        '".',
                );
            }
        });

        if (populatedHeaders.length < headers.length) {
            const missing = headers.slice(populatedHeaders.length);
            sheet.getRange(1, populatedHeaders.length + 1, 1, missing.length).setValues([missing]);
        }
    }
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
}

function writeSchemaVersion(): void {
    const key = 'schema:version';
    const row = Tables.Settings.findById(key);
    if (row) Tables.Settings.updateById(key, { Value: CURRENT_SCHEMA_VERSION });
    else Tables.Settings.insert({ Id: key, Value: CURRENT_SCHEMA_VERSION });
}

// Production migration entry point. It creates a recoverable whole-file copy
// before adding columns, then reports row counts so the operator can reconcile
// the original and migrated workbooks without exposing row contents.
function backupAndMigrateSheets(): SchemaMigrationReport {
    const spreadsheetId = getSpreadsheetId();
    const stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd-HHmmss');
    const backup = DriveApp.getFileById(spreadsheetId).makeCopy(
        'Setu backup before schema v2 ' + stamp,
    );
    setupSheets();

    const recordCounts: Record<string, number> = {};
    Object.values(Tables).forEach((table) => {
        recordCounts[table.tabName] = table.readAll().length;
    });
    return { backupFileId: backup.getId(), schemaVersion: CURRENT_SCHEMA_VERSION, recordCounts };
}

function removeDefaultSheetIfEmpty(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
        ss.deleteSheet(defaultSheet);
    }
}
