// One-time bootstrap functions. Not exposed to the frontend — run manually
// from the Apps Script editor (select the function, click Run) after the
// first `clasp push`. Both are idempotent, safe to re-run after future pushes.

function setupSheets(): void {
    const ss = SpreadsheetApp.openById(getSpreadsheetId());

    // Create the complete table topology before migrations inspect any table.
    // This matters on a fresh spreadsheet: migration helpers read related
    // tables (for example Users and Settings) before they can safely migrate
    // request data or remove obsolete settings.
    Object.values(Tables).forEach((table) => {
        ensureTabWithHeaders(ss, table.tabName, table.headers as string[]);
    });

    migrateUsersTimezoneColumn(ss);
    migrateInventoryRequestImageColumns(ss);
    migrateTableToCurrentHeaders(ss, 'Departments', Tables.Departments.headers as string[]);
    migrateRequestsDepartmentLeadColumns(ss, 'InventoryRequests');
    migrateRequestsDepartmentLeadColumns(ss, 'ProgramRequests');
    migrateTableToCurrentHeaders(ss, 'Tickets', Tables.Tickets.headers as string[]);
    removeObsoleteHomeSettings();

    removeDefaultSheetIfEmpty(ss);
}

// Quick links and the old home-page support/tutorial fields are no longer
// part of the configuration model. Remove their Settings rows when the
// one-time bootstrap is rerun so the sheet reflects the current model.
function removeObsoleteHomeSettings(): void {
    ['links', 'SupportMessage', 'WhatsappUrl', 'TutorialUrl'].forEach((id) => {
        if (Tables.Settings.findById(id)) Tables.Settings.deleteById(id);
    });
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
            if (header === 'ItemsJson') {
                const existing = valueAt(row, headerIndex('ItemsJson'));
                if (existing) return existing;
                return '[]';
            }
            if (header === 'SessionsJson') {
                const existing = valueAt(row, headerIndex('SessionsJson'));
                if (existing) return existing;
                return '[]';
            }
            if (header === 'CommentsJson') {
                const existing = valueAt(row, headerIndex('CommentsJson'));
                if (existing) return existing;
                return '[]';
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
