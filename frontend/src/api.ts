// The only file that talks to the backend. `google.script.run` is injected
// automatically by the Apps Script HTML service runtime when this page is
// served from script.google.com — outside that runtime (local dev via
// `npm run dev`) `google` is undefined, so we fall back to `googleMock`
// (mock/backend.ts), which replicates the exact same
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

export const api: AsyncApi = {
    whoAmI: (...args) => callBackend('whoAmI', ...args),
    getDashboard: (...args) => callBackend('getDashboard', ...args),

    listUsers: (...args) => callBackend('listUsers', ...args),
    createUser: (...args) => callBackend('createUser', ...args),
    updateUser: (...args) => callBackend('updateUser', ...args),
    updateOwnProfile: (...args) => callBackend('updateOwnProfile', ...args),

    listDepartments: (...args) => callBackend('listDepartments', ...args),
    createDepartment: (...args) => callBackend('createDepartment', ...args),
    updateDepartment: (...args) => callBackend('updateDepartment', ...args),
    deleteDepartment: (...args) => callBackend('deleteDepartment', ...args),

    listPlaces: (...args) => callBackend('listPlaces', ...args),
    createPlace: (...args) => callBackend('createPlace', ...args),
    updatePlace: (...args) => callBackend('updatePlace', ...args),
    deletePlace: (...args) => callBackend('deletePlace', ...args),

    getHomeContent: (...args) => callBackend('getHomeContent', ...args),
    updateHomeContent: (...args) => callBackend('updateHomeContent', ...args),

    listShiftPresets: (...args) => callBackend('listShiftPresets', ...args),
    createShiftPreset: (...args) => callBackend('createShiftPreset', ...args),
    updateShiftPreset: (...args) => callBackend('updateShiftPreset', ...args),
    deleteShiftPreset: (...args) => callBackend('deleteShiftPreset', ...args),

    listProgramTypes: (...args) => callBackend('listProgramTypes', ...args),
    createProgramType: (...args) => callBackend('createProgramType', ...args),
    updateProgramType: (...args) => callBackend('updateProgramType', ...args),
    deleteProgramType: (...args) => callBackend('deleteProgramType', ...args),

    listProgramLanguages: (...args) => callBackend('listProgramLanguages', ...args),
    createProgramLanguage: (...args) => callBackend('createProgramLanguage', ...args),
    updateProgramLanguage: (...args) => callBackend('updateProgramLanguage', ...args),
    deleteProgramLanguage: (...args) => callBackend('deleteProgramLanguage', ...args),

    listSessionTypes: (...args) => callBackend('listSessionTypes', ...args),
    createSessionType: (...args) => callBackend('createSessionType', ...args),
    updateSessionType: (...args) => callBackend('updateSessionType', ...args),
    deleteSessionType: (...args) => callBackend('deleteSessionType', ...args),

    listBlocks: (...args) => callBackend('listBlocks', ...args),
    createBlock: (...args) => callBackend('createBlock', ...args),
    updateBlock: (...args) => callBackend('updateBlock', ...args),
    deleteBlock: (...args) => callBackend('deleteBlock', ...args),

    listRosters: (...args) => callBackend('listRosters', ...args),
    createRoster: (...args) => callBackend('createRoster', ...args),
    updateRoster: (...args) => callBackend('updateRoster', ...args),
    deleteRoster: (...args) => callBackend('deleteRoster', ...args),

    listInventoryTypes: (...args) => callBackend('listInventoryTypes', ...args),
    createInventoryType: (...args) => callBackend('createInventoryType', ...args),
    updateInventoryType: (...args) => callBackend('updateInventoryType', ...args),
    deleteInventoryType: (...args) => callBackend('deleteInventoryType', ...args),

    listInventoryRequests: (...args) => callBackend('listInventoryRequests', ...args),
    getInventoryRequest: (...args) => callBackend('getInventoryRequest', ...args),
    createInventoryRequest: (...args) => callBackend('createInventoryRequest', ...args),
    updateInventoryRequest: (...args) => callBackend('updateInventoryRequest', ...args),
    performInventoryRequestAction: (...args) =>
        callBackend('performInventoryRequestAction', ...args),

    listProgramRequests: (...args) => callBackend('listProgramRequests', ...args),
    getProgramRequest: (...args) => callBackend('getProgramRequest', ...args),
    createProgramRequest: (...args) => callBackend('createProgramRequest', ...args),
    updateProgramRequest: (...args) => callBackend('updateProgramRequest', ...args),
    performProgramRequestAction: (...args) => callBackend('performProgramRequestAction', ...args),

    listTickets: (...args) => callBackend('listTickets', ...args),
    getTicket: (...args) => callBackend('getTicket', ...args),
    createTicket: (...args) => callBackend('createTicket', ...args),
    updateTicket: (...args) => callBackend('updateTicket', ...args),
    performTicketAction: (...args) => callBackend('performTicketAction', ...args),
    addComment: (...args) => callBackend('addComment', ...args),

    uploadImage: (...args) => callBackend('uploadImage', ...args),
};
