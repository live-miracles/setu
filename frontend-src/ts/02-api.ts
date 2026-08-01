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
    updateUser: (...args) => callBackend('updateUser', ...args),
    updateOwnProfile: (...args) => callBackend('updateOwnProfile', ...args),

    listDepartments: (...args) => callBackend('listDepartments', ...args),
    createDepartment: (...args) => callBackend('createDepartment', ...args),

    listPlaces: (...args) => callBackend('listPlaces', ...args),
    createPlace: (...args) => callBackend('createPlace', ...args),

    listLinks: (...args) => callBackend('listLinks', ...args),
    createLink: (...args) => callBackend('createLink', ...args),

    getHomeContent: (...args) => callBackend('getHomeContent', ...args),
    updateHomeContent: (...args) => callBackend('updateHomeContent', ...args),

    listRosters: (...args) => callBackend('listRosters', ...args),
    createRoster: (...args) => callBackend('createRoster', ...args),

    listInventoryTypes: (...args) => callBackend('listInventoryTypes', ...args),
    createInventoryType: (...args) => callBackend('createInventoryType', ...args),

    listInventoryRequests: (...args) => callBackend('listInventoryRequests', ...args),
    createInventoryRequest: (...args) => callBackend('createInventoryRequest', ...args),
    performInventoryRequestAction: (...args) =>
        callBackend('performInventoryRequestAction', ...args),

    listProgramRequests: (...args) => callBackend('listProgramRequests', ...args),
    createProgramRequest: (...args) => callBackend('createProgramRequest', ...args),
    performProgramRequestAction: (...args) => callBackend('performProgramRequestAction', ...args),

    listTickets: (...args) => callBackend('listTickets', ...args),
    createTicket: (...args) => callBackend('createTicket', ...args),
    performTicketAction: (...args) => callBackend('performTicketAction', ...args),
    addComment: (...args) => callBackend('addComment', ...args),

    uploadImage: (...args) => callBackend('uploadImage', ...args),
};
