// One-time bootstrap functions. Not exposed to the frontend — run manually
// from the Apps Script editor (select the function, click Run) after the
// first `clasp push`. Both are idempotent, safe to re-run after future pushes.

function setupSheets(): void {
    const ss = SpreadsheetApp.openById(getSpreadsheetId());

    Object.values(Tables).forEach((table) => {
        ensureTabWithHeaders(ss, table.tabName, table.headers as string[]);
    });

    ensureTabWithHeaders(ss, 'Counters', ['Name', 'NextValue']);
    seedCounterIfMissing(ss, 'inventory_request', 1);
    seedCounterIfMissing(ss, 'program_request', 1);
    seedCounterIfMissing(ss, 'ticket', 1);

    removeDefaultSheetIfEmpty(ss);
}

function ensureTabWithHeaders(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    tabName: string,
    headers: string[],
): void {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
        sheet = ss.insertSheet(tabName);
    }
    const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const headersMatch = headers.every((h, i) => existingHeaders[i] === h);
    if (!headersMatch) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
}

function seedCounterIfMissing(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    name: string,
    startValue: number,
): void {
    const sheet = ss.getSheetByName('Counters')!;
    const data = sheet.getDataRange().getValues();
    const exists = data.some((row, i) => i > 0 && row[0] === name);
    if (!exists) sheet.appendRow([name, startValue]);
}

function removeDefaultSheetIfEmpty(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
        ss.deleteSheet(defaultSheet);
    }
}
