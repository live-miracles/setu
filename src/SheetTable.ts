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

function SheetTable<T extends { Id: string }>(tabName: string, headers: (keyof T & string)[]) {
    const idCol = headers.indexOf('Id' as keyof T & string) + 1;

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
            .filter((o) => o.Id !== '' && o.Id != null);
    }

    function findRowIndexById(id: string): number {
        const sh = sheet();
        const lastRow = sh.getLastRow();
        if (lastRow < 2) return -1;
        const ids = sh.getRange(2, idCol, lastRow - 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) {
            if (ids[i][0] === id) return i + 2;
        }
        return -1;
    }

    function findById(id: string): T | null {
        const rowIndex = findRowIndexById(id);
        if (rowIndex === -1) return null;
        return rowToObject(sheet().getRange(rowIndex, 1, 1, headers.length).getValues()[0]);
    }

    function findWhere(predicate: (row: T) => boolean): T[] {
        return readAll().filter(predicate);
    }

    function insert(obj: Partial<T>): T {
        const record = Object.assign({ Id: Utilities.getUuid() }, obj) as T;
        sheet().appendRow(objectToRow(record));
        return record;
    }

    function updateById(id: string, patch: Partial<T>): T {
        const rowIndex = findRowIndexById(id);
        if (rowIndex === -1) throw new Error(tabName + ' row not found: ' + id);
        const current = rowToObject(
            sheet().getRange(rowIndex, 1, 1, headers.length).getValues()[0],
        );
        const updated = Object.assign({}, current, patch, { Id: id }) as T;
        sheet()
            .getRange(rowIndex, 1, 1, headers.length)
            .setValues([objectToRow(updated)]);
        return updated;
    }

    function deleteById(id: string): boolean {
        const rowIndex = findRowIndexById(id);
        if (rowIndex === -1) return false;
        sheet().deleteRow(rowIndex);
        return true;
    }

    return {
        tabName,
        headers,
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
    Locations: SheetTable<Place>('Locations', ['Id', 'Name']),
    Profiles: SheetTable<Profile>('Profiles', [
        'Id',
        'Email',
        'Name',
        'Role',
        'Status',
        'DepartmentId',
        'Timezone',
        'Phone',
        'Whatsapp',
        'NotificationEmail',
    ]),
    RosterShifts: SheetTable<RosterShift>('RosterShifts', [
        'Id',
        'StartDate',
        'EndDate',
        'StartTime',
        'EndTime',
        'ShiftName',
        'AssigneeProfileId',
    ]),
    EquipmentTypes: SheetTable<EquipmentType>('EquipmentTypes', [
        'Id',
        'Name',
        'Description',
        'Requestable',
        'ImageDriveFileId',
        'TotalQuantity',
    ]),
    InventoryRequests: SheetTable<InventoryRequest>('InventoryRequests', [
        'Id',
        'DisplayId',
        'Title',
        'RequesterId',
        'FromDate',
        'ToDate',
        'Purpose',
        'Status',
        'AdminNote',
    ]),
    InventoryRequestItems: SheetTable<InventoryRequestItem>('InventoryRequestItems', [
        'Id',
        'RequestId',
        'EquipmentTypeId',
        'Quantity',
        'IssuedQuantity',
        'ReturnedQuantity',
    ]),
    InventoryReturns: SheetTable<InventoryReturn>('InventoryReturns', [
        'Id',
        'RequestItemId',
        'Quantity',
        'Condition',
        'Notes',
        'ReceivedBy',
    ]),
    Tickets: SheetTable<Ticket>('Tickets', [
        'Id',
        'DisplayId',
        'Title',
        'Description',
        'LocationId',
        'LocationName',
        'Priority',
        'Status',
        'ReporterId',
        'AssigneeId',
    ]),
    Comments: SheetTable<CommentRecord>('Comments', [
        'Id',
        'OwnerType',
        'OwnerId',
        'AuthorId',
        'Message',
        'CreatedAt',
    ]),
    Links: SheetTable<Link>('Links', ['Id', 'Name', 'Url', 'DisplayOrder', 'Enabled']),
    HomeContent: SheetTable<HomeContent>('HomeContent', [
        'Id',
        'SupportMessage',
        'Guidelines',
        'WhatsappUrl',
        'TutorialUrl',
        'UpdatedBy',
    ]),
    FailedNotifications: SheetTable<FailedNotification>('FailedNotifications', [
        'Id',
        'Timestamp',
        'RecipientId',
        'Channel',
        'Title',
        'Message',
        'Error',
    ]),
};

function getNextDisplayId(counterName: string): number {
    const sh = SpreadsheetApp.openById(getSpreadsheetId()).getSheetByName('Counters');
    if (!sh) throw new Error('Sheet tab not found: Counters');
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === counterName) {
            const next = data[i][1];
            sh.getRange(i + 1, 2).setValue(next + 1);
            return next;
        }
    }
    sh.appendRow([counterName, 2]);
    return 1;
}
