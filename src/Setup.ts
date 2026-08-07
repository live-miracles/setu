// One-time bootstrap functions. Not exposed to the frontend — run manually
// from the Apps Script editor (select the function, click Run) after the
// first `clasp push`. Both are idempotent, safe to re-run after future pushes.

function setupSheets(): void {
    const ss = SpreadsheetApp.openById(getSpreadsheetId());

    migrateUsersTimezoneColumn(ss);
    migrateInventoryRequestImageColumns(ss);
    migrateCommentsRequestIdColumn(ss);
    migrateTableToCurrentHeaders(ss, 'Departments', Tables.Departments.headers as string[]);
    migrateRequestsDepartmentLeadColumns(ss, 'InventoryRequests');
    migrateRequestsDepartmentLeadColumns(ss, 'ProgramRequests');

    Object.values(Tables).forEach((table) => {
        ensureTabWithHeaders(ss, table.tabName, table.headers as string[]);
    });

    removeDefaultSheetIfEmpty(ss);
}

function migrateTableToCurrentHeaders(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    tabName: string,
    desiredHeaders: string[],
): void {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;
    const lastColumn = Math.max(sheet.getLastColumn(), desiredHeaders.length);
    const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    if (
        existingHeaders.length >= desiredHeaders.length &&
        desiredHeaders.every((header, index) => existingHeaders[index] === header)
    ) {
        return;
    }
    const headerIndex = (header: string) => existingHeaders.indexOf(header);
    const lastRow = sheet.getLastRow();
    const rowCount = Math.max(lastRow - 1, 0);
    const oldRows = rowCount > 0 ? sheet.getRange(2, 1, rowCount, lastColumn).getValues() : [];
    const migratedRows = oldRows.map((row) =>
        desiredHeaders.map((header) => valueAt(row, headerIndex(header))),
    );
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    if (migratedRows.length > 0) {
        sheet.getRange(2, 1, migratedRows.length, desiredHeaders.length).setValues(migratedRows);
    }
    const surplusColumns = sheet.getMaxColumns() - desiredHeaders.length;
    if (surplusColumns > 0) {
        sheet.deleteColumns(desiredHeaders.length + 1, surplusColumns);
    }
}

function migrateRequestsDepartmentLeadColumns(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    tabName: 'InventoryRequests' | 'ProgramRequests',
): void {
    const desiredHeaders =
        tabName === 'InventoryRequests'
            ? (Tables.InventoryRequests.headers as string[])
            : (Tables.ProgramRequests.headers as string[]);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;

    const usersByEmail = indexBy(Tables.Users.readAll(), (user) => user.Email);
    const departmentsById = indexBy(Tables.Departments.readAll(), (department) => department.Id);
    const lastColumn = Math.max(sheet.getLastColumn(), desiredHeaders.length);
    const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    const headerIndex = (header: string) => existingHeaders.indexOf(header);
    const lastRow = sheet.getLastRow();
    const rowCount = Math.max(lastRow - 1, 0);
    const oldRows = rowCount > 0 ? sheet.getRange(2, 1, rowCount, lastColumn).getValues() : [];
    const migratedRows = oldRows.map((row) =>
        desiredHeaders.map((header) => {
            if (header === 'DepartmentId') {
                return (
                    valueAt(row, headerIndex('DepartmentId')) ||
                    usersByEmail[valueAt(row, headerIndex('UserId'))]?.DepartmentId ||
                    ''
                );
            }
            if (header === 'LeadEmail') {
                const departmentId =
                    valueAt(row, headerIndex('DepartmentId')) ||
                    usersByEmail[valueAt(row, headerIndex('UserId'))]?.DepartmentId ||
                    '';
                return (
                    valueAt(row, headerIndex('LeadEmail')) ||
                    departmentsById[departmentId]?.LeadEmail ||
                    ''
                );
            }
            return valueAt(row, headerIndex(header));
        }),
    );

    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    if (migratedRows.length > 0) {
        sheet.getRange(2, 1, migratedRows.length, desiredHeaders.length).setValues(migratedRows);
    }
    const surplusColumns = sheet.getMaxColumns() - desiredHeaders.length;
    if (surplusColumns > 0) {
        sheet.deleteColumns(desiredHeaders.length + 1, surplusColumns);
    }
}

function migrateUsersTimezoneColumn(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    const sheet = ss.getSheetByName('Users');
    if (!sheet) return;

    const desiredHeaders = Tables.Users.headers as string[];
    const lastColumn = Math.max(sheet.getLastColumn(), desiredHeaders.length);
    const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    if (existingHeaders.indexOf('Timezone') === -1) return;

    const headerIndex = (header: string) => existingHeaders.indexOf(header);
    const lastRow = sheet.getLastRow();
    const rowCount = Math.max(lastRow - 1, 0);
    const oldRows = rowCount > 0 ? sheet.getRange(2, 1, rowCount, lastColumn).getValues() : [];
    const migratedRows = oldRows.map((row) =>
        desiredHeaders.map((header) => valueAt(row, headerIndex(header))),
    );

    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    if (migratedRows.length > 0) {
        sheet.getRange(2, 1, migratedRows.length, desiredHeaders.length).setValues(migratedRows);
    }
    const surplusColumns = sheet.getMaxColumns() - desiredHeaders.length;
    if (surplusColumns > 0) {
        sheet.deleteColumns(desiredHeaders.length + 1, surplusColumns);
    }
}

function migrateInventoryRequestImageColumns(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    const sheet = ss.getSheetByName('InventoryRequests');
    if (!sheet) return;

    const desiredHeaders = Tables.InventoryRequests.headers as string[];
    const lastColumn = Math.max(sheet.getLastColumn(), desiredHeaders.length);
    const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    const hasOldImageColumns = ['Image1Id', 'Image2Id', 'Image3Id'].some(
        (header) => existingHeaders.indexOf(header) !== -1,
    );
    if (!hasOldImageColumns && existingHeaders.indexOf('ImageId') !== -1) return;

    const headerIndex = (header: string) => existingHeaders.indexOf(header);
    const lastRow = sheet.getLastRow();
    const rowCount = Math.max(lastRow - 1, 0);
    const oldRows = rowCount > 0 ? sheet.getRange(2, 1, rowCount, lastColumn).getValues() : [];
    const migratedRows = oldRows.map((row) =>
        desiredHeaders.map((header) => {
            if (header === 'ImageId') {
                return (
                    valueAt(row, headerIndex('ImageId')) ||
                    valueAt(row, headerIndex('Image1Id')) ||
                    valueAt(row, headerIndex('Image2Id')) ||
                    valueAt(row, headerIndex('Image3Id'))
                );
            }
            if (header === 'Participants') {
                return valueAt(row, lastHeaderIndex(existingHeaders, header));
            }
            return valueAt(row, headerIndex(header));
        }),
    );

    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    if (migratedRows.length > 0) {
        sheet.getRange(2, 1, migratedRows.length, desiredHeaders.length).setValues(migratedRows);
    }
    const surplusColumns = sheet.getMaxColumns() - desiredHeaders.length;
    if (surplusColumns > 0) {
        sheet.deleteColumns(desiredHeaders.length + 1, surplusColumns);
    }
}

function migrateCommentsRequestIdColumn(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    const sheet = ss.getSheetByName('Comments');
    if (!sheet) return;

    const desiredHeaders = Tables.Comments.headers as string[];
    const lastColumn = Math.max(sheet.getLastColumn(), desiredHeaders.length);
    const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    const hasRequestId = existingHeaders.indexOf('RequestId') !== -1;
    const hasOldRequestColumns =
        existingHeaders.indexOf('ProgramRequestId') !== -1 ||
        existingHeaders.indexOf('InventoryRequestId') !== -1;
    if (hasRequestId && !hasOldRequestColumns) return;

    const headerIndex = (header: string) => existingHeaders.indexOf(header);
    const lastRow = sheet.getLastRow();
    const rowCount = Math.max(lastRow - 1, 0);
    const oldRows = rowCount > 0 ? sheet.getRange(2, 1, rowCount, lastColumn).getValues() : [];
    const migratedRows = oldRows.map((row) =>
        desiredHeaders.map((header) => {
            if (header === 'RequestId') {
                return (
                    valueAt(row, headerIndex('RequestId')) ||
                    valueAt(row, headerIndex('InventoryRequestId')) ||
                    valueAt(row, headerIndex('ProgramRequestId'))
                );
            }
            return valueAt(row, headerIndex(header));
        }),
    );

    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    if (migratedRows.length > 0) {
        sheet.getRange(2, 1, migratedRows.length, desiredHeaders.length).setValues(migratedRows);
    }
    const surplusColumns = sheet.getMaxColumns() - desiredHeaders.length;
    if (surplusColumns > 0) {
        sheet.deleteColumns(desiredHeaders.length + 1, surplusColumns);
    }
}

function valueAt(row: any[], index: number): any {
    return index >= 0 ? row[index] : '';
}

function lastHeaderIndex(headers: string[], header: string): number {
    for (let i = headers.length - 1; i >= 0; i--) {
        if (headers[i] === header) return i;
    }
    return -1;
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

function removeDefaultSheetIfEmpty(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
        ss.deleteSheet(defaultSheet);
    }
}
