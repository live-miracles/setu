function getSpreadsheetId(): string {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Script property SPREADSHEET_ID is not set.');
    return id;
}

// Wraps a full read-modify-write sequence in one mutex. Every mutating call
// site locks the *entire* sequence, not just the final write — multi-lang-qa
// only locked the final append/update call, leaving the read-then-locate-row
// step racy; this is the fix for that.
function withLock<T>(fn: () => T): T {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
        return fn();
    } finally {
        lock.releaseLock();
    }
}

// keyColumn defaults to 'Id' but Users is keyed by 'Email' instead (its
// primary key is the account email itself, not a generated id) — insert()
// only auto-generates a uuid for the key column when the caller didn't
// already supply one, which is what makes both keying schemes work through
// the same helper.
function SheetTable<T extends Record<string, any>>(
    tabName: string,
    headers: (keyof T & string)[],
    keyColumn: keyof T & string = 'Id' as keyof T & string,
) {
    const keyCol = headers.indexOf(keyColumn) + 1;

    function sheet(): GoogleAppsScript.Spreadsheet.Sheet {
        const sh = SpreadsheetApp.openById(getSpreadsheetId()).getSheetByName(tabName);
        if (!sh) throw new Error('Sheet tab not found: ' + tabName);
        return sh;
    }

    function rowToObject(row: any[]): T {
        const obj: any = {};
        headers.forEach((h, i) => {
            obj[h] = row[i];
        });
        return obj as T;
    }

    function objectToRow(obj: any): any[] {
        return headers.map((h) => (obj[h] === undefined ? '' : obj[h]));
    }

    function readAll(): T[] {
        const sh = sheet();
        const lastRow = sh.getLastRow();
        if (lastRow < 2) return [];
        return sh
            .getRange(2, 1, lastRow - 1, headers.length)
            .getValues()
            .map(rowToObject)
            .filter((o: any) => o[keyColumn] !== '' && o[keyColumn] != null);
    }

    function findRowIndexById(key: string): number {
        const sh = sheet();
        const lastRow = sh.getLastRow();
        if (lastRow < 2) return -1;
        const keys = sh.getRange(2, keyCol, lastRow - 1, 1).getValues();
        for (let i = 0; i < keys.length; i++) {
            if (keys[i][0] === key) return i + 2;
        }
        return -1;
    }

    function findById(key: string): T | null {
        const rowIndex = findRowIndexById(key);
        if (rowIndex === -1) return null;
        return rowToObject(sheet().getRange(rowIndex, 1, 1, headers.length).getValues()[0]);
    }

    function findWhere(predicate: (row: T) => boolean): T[] {
        return readAll().filter(predicate);
    }

    function insert(obj: Partial<T>): T {
        const record = Object.assign({}, obj) as T;
        if ((record as any)[keyColumn] === undefined || (record as any)[keyColumn] === '') {
            (record as any)[keyColumn] = Utilities.getUuid();
        }
        sheet().appendRow(objectToRow(record));
        return record;
    }

    function updateById(key: string, patch: Partial<T>): T {
        const rowIndex = findRowIndexById(key);
        if (rowIndex === -1) throw new Error(tabName + ' row not found: ' + key);
        const current = rowToObject(
            sheet().getRange(rowIndex, 1, 1, headers.length).getValues()[0],
        );
        const updated = Object.assign({}, current, patch) as T;
        (updated as any)[keyColumn] = key;
        sheet()
            .getRange(rowIndex, 1, 1, headers.length)
            .setValues([objectToRow(updated)]);
        return updated;
    }

    function deleteById(key: string): boolean {
        const rowIndex = findRowIndexById(key);
        if (rowIndex === -1) return false;
        sheet().deleteRow(rowIndex);
        return true;
    }

    return {
        tabName,
        headers,
        keyColumn,
        readAll,
        findById,
        findWhere,
        insert,
        updateById,
        deleteById,
        findRowIndexById,
        sheet,
    };
}

const Tables = {
    Departments: SheetTable<Department>('Departments', ['Id', 'Name', 'ShortName']),
    Places: SheetTable<Place>('Places', ['Id', 'Name']),
    Users: SheetTable<User>(
        'Users',
        ['Email', 'Name', 'Role', 'DepartmentId', 'Phone', 'Whatsapp'],
        'Email',
    ),
    Rosters: SheetTable<Roster>('Rosters', [
        'Id',
        'Name',
        'StartDate',
        'EndDate',
        'StartTime',
        'EndTime',
        'UserId',
    ]),
    InventoryTypes: SheetTable<InventoryType>('InventoryTypes', [
        'Id',
        'Name',
        'Description',
        'Requestable',
        'ImageId',
        'TotalQuantity',
    ]),
    InventoryRequests: SheetTable<InventoryRequest>('InventoryRequests', [
        'Id',
        'DisplayId',
        'Name',
        'UserId',
        'StartDate',
        'EndDate',
        'Status',
        'ImageId',
        'Participants',
    ]),
    InventoryItems: SheetTable<InventoryItem>('InventoryItems', [
        'Id',
        'RequestId',
        'InventoryTypeId',
        'Quantity',
        'Condition',
    ]),
    ProgramRequests: SheetTable<ProgramRequest>('ProgramRequests', [
        'Id',
        'DisplayId',
        'Name',
        'Type',
        'UserId',
        'Status',
        'PlaceId',
        'Participants',
    ]),
    Sessions: SheetTable<ProgramSession>('Sessions', [
        'Id',
        'Name',
        'Type',
        'RequestId',
        'StartDateTime',
        'EndDateTime',
    ]),
    Tickets: SheetTable<Ticket>('Tickets', [
        'Id',
        'DisplayId',
        'Title',
        'Description',
        'Status',
        'AssigneeId',
    ]),
    Comments: SheetTable<CommentRecord>('Comments', [
        'Id',
        'Timestamp',
        'RequestId',
        'UserId',
        'Message',
    ]),
    // No separate Links tab: links are stored as one JSON-encoded row here
    // (Id 'links'), the same generic-key-value pattern HomeContent already
    // uses — see readLinks/writeLinks in Admin.ts.
    Settings: SheetTable<SettingRow>('Settings', ['Id', 'Value']),
    FailedEmails: SheetTable<FailedEmail>('FailedEmails', [
        'Id',
        'Timestamp',
        'UserId',
        'Title',
        'Message',
        'Error',
    ]),
};

// No separate Counters tab: each counter is a JSON-free Settings row keyed
// 'counter:<name>', the same generic-key-value pattern the Settings table
// already uses for links/home content — see Admin.ts. Callers already run
// this inside a withLock/withLockedDedupe critical section, so no locking
// here.
function getNextDisplayId(counterName: string): number {
    const key = 'counter:' + counterName;
    const setting = Tables.Settings.findById(key);
    if (!setting) {
        Tables.Settings.insert({ Id: key, Value: '2' });
        return 1;
    }
    const next = parseInt(setting.Value, 10);
    Tables.Settings.updateById(key, { Value: String(next + 1) });
    return next;
}
