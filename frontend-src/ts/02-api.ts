// The only file that talks to the backend. `google.script.run` is injected
// automatically by the Apps Script HTML service runtime when this page is
// served from script.google.com — outside that runtime (local dev via
// browser-sync) `google` is undefined, so we fall back to `googleMock`
// (01-mock-backend.ts), which replicates the exact same
// `.withSuccessHandler().withFailureHandler().<fnName>()` chain against
// in-memory data. Every call site in the render modules is identical either
// way.
declare const google: { script: { run: any } } | undefined;

type AsyncApi = { [K in keyof Api]: (...args: Parameters<Api[K]>) => Promise<ReturnType<Api[K]>> };

function getScriptRunner(): any {
    const runner = typeof google !== 'undefined' && google ? google : (window as any).googleMock;
    return runner.script.run;
}

function callBackend<K extends keyof Api>(
    fnName: K,
    ...args: Parameters<Api[K]>
): Promise<ReturnType<Api[K]>> {
    return new Promise((resolve, reject) => {
        getScriptRunner()
            .withSuccessHandler((data: ReturnType<Api[K]>) => resolve(data))
            .withFailureHandler((error: unknown) => reject(error))
            [fnName](...args);
    });
}

const api: AsyncApi = {
    whoAmI: (...args) => callBackend('whoAmI', ...args),
    getDashboard: (...args) => callBackend('getDashboard', ...args),

    listUsers: (...args) => callBackend('listUsers', ...args),
    inviteUser: (...args) => callBackend('inviteUser', ...args),
    updateUser: (...args) => callBackend('updateUser', ...args),
    updateOwnProfile: (...args) => callBackend('updateOwnProfile', ...args),

    listDepartments: (...args) => callBackend('listDepartments', ...args),
    createDepartment: (...args) => callBackend('createDepartment', ...args),

    listLocations: (...args) => callBackend('listLocations', ...args),
    createLocation: (...args) => callBackend('createLocation', ...args),

    listLinks: (...args) => callBackend('listLinks', ...args),
    createLink: (...args) => callBackend('createLink', ...args),

    getHomeContent: (...args) => callBackend('getHomeContent', ...args),
    updateHomeContent: (...args) => callBackend('updateHomeContent', ...args),
    listActivityLog: (...args) => callBackend('listActivityLog', ...args),

    listRosterShifts: (...args) => callBackend('listRosterShifts', ...args),
    createRosterShift: (...args) => callBackend('createRosterShift', ...args),

    listEquipmentTypes: (...args) => callBackend('listEquipmentTypes', ...args),
    createEquipmentType: (...args) => callBackend('createEquipmentType', ...args),

    listInventoryItems: (...args) => callBackend('listInventoryItems', ...args),
    createInventoryItem: (...args) => callBackend('createInventoryItem', ...args),

    listInventoryRequests: (...args) => callBackend('listInventoryRequests', ...args),
    createInventoryRequest: (...args) => callBackend('createInventoryRequest', ...args),
    performInventoryRequestAction: (...args) =>
        callBackend('performInventoryRequestAction', ...args),

    listTickets: (...args) => callBackend('listTickets', ...args),
    createTicket: (...args) => callBackend('createTicket', ...args),
    performTicketAction: (...args) => callBackend('performTicketAction', ...args),
    addComment: (...args) => callBackend('addComment', ...args),

    uploadAttachmentChunk: (...args) => callBackend('uploadAttachmentChunk', ...args),
    finishAttachmentUpload: (...args) => callBackend('finishAttachmentUpload', ...args),
    getAttachmentContent: (...args) => callBackend('getAttachmentContent', ...args),
    listAttachmentsFor: (...args) => callBackend('listAttachmentsFor', ...args),
};
