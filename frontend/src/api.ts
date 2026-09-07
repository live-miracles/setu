import { supabase } from './supabase';

// The UI talks to exactly one application API: the protected Supabase Edge
// Function. Local development uses the same path as Vercel, so the database,
// RLS policies and backend implementation are always the source of truth.

type AsyncApi = { [K in keyof Api]: (...args: Parameters<Api[K]>) => Promise<ReturnType<Api[K]>> };

// The Edge Function reports its error as a JSON body (`{ error: "..." }`),
// but supabase-js's own error.message is just a generic "non-2xx status
// code" — useless in a screenshot. Recover the real message plus the
// operation name and HTTP status so a bug report is debuggable on its own.
async function describeApiError(fnName: string, error: unknown, response?: Response): Promise<Error> {
    let detail = error instanceof Error ? error.message : String(error);
    if (response) {
        try {
            const body = await response.json();
            if (body && typeof body.error === 'string') detail = body.error;
        } catch {
            // Response body wasn't JSON (e.g. a relay/network failure) — keep the fallback detail.
        }
    }
    const status = response?.status ? ` (HTTP ${response.status})` : '';
    return new Error(`${fnName}${status}: ${detail}`);
}

function callBackend<K extends keyof Api>(
    fnName: K,
    ...args: Parameters<Api[K]>
): Promise<ReturnType<Api[K]>> {
    return supabase()
        .functions.invoke('api', { body: { operation: fnName, args } })
        .then(async ({ data, error, response }) => {
            if (error) throw await describeApiError(String(fnName), error, response);
            return data as ReturnType<Api[K]>;
        });
}

export const api: AsyncApi = {
    whoAmI: (...args) => callBackend('whoAmI', ...args),
    getDashboard: (...args) => callBackend('getDashboard', ...args),

    listUsers: (...args) => callBackend('listUsers', ...args),
    createUser: (...args) => callBackend('createUser', ...args),
    updateUser: (...args) => callBackend('updateUser', ...args),
    deleteUser: (...args) => callBackend('deleteUser', ...args),
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

    getSettings: (...args) => callBackend('getSettings', ...args),
    createShiftType: (...args) => callBackend('createShiftType', ...args),
    updateShiftType: (...args) => callBackend('updateShiftType', ...args),
    deleteShiftType: (...args) => callBackend('deleteShiftType', ...args),

    createProgramType: (...args) => callBackend('createProgramType', ...args),
    updateProgramType: (...args) => callBackend('updateProgramType', ...args),
    deleteProgramType: (...args) => callBackend('deleteProgramType', ...args),

    createProgramLanguage: (...args) => callBackend('createProgramLanguage', ...args),
    updateProgramLanguage: (...args) => callBackend('updateProgramLanguage', ...args),
    deleteProgramLanguage: (...args) => callBackend('deleteProgramLanguage', ...args),

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
    updateInventoryRequestParticipants: (...args) =>
        callBackend('updateInventoryRequestParticipants', ...args),
    deleteInventoryRequest: (...args) => callBackend('deleteInventoryRequest', ...args),
    performInventoryRequestAction: (...args) =>
        callBackend('performInventoryRequestAction', ...args),

    listProgramRequests: (...args) => callBackend('listProgramRequests', ...args),
    getProgramRequest: (...args) => callBackend('getProgramRequest', ...args),
    getAvailablePlaces: (...args) => callBackend('getAvailablePlaces', ...args),
    getCalendarMonth: (...args) => callBackend('getCalendarMonth', ...args),
    createProgramRequest: (...args) => callBackend('createProgramRequest', ...args),
    updateProgramRequest: (...args) => callBackend('updateProgramRequest', ...args),
    updateProgramRequestParticipants: (...args) =>
        callBackend('updateProgramRequestParticipants', ...args),
    deleteProgramRequest: (...args) => callBackend('deleteProgramRequest', ...args),
    performProgramRequestAction: (...args) => callBackend('performProgramRequestAction', ...args),

    listTickets: (...args) => callBackend('listTickets', ...args),
    getTicket: (...args) => callBackend('getTicket', ...args),
    createTicket: (...args) => callBackend('createTicket', ...args),
    updateTicket: (...args) => callBackend('updateTicket', ...args),
    performTicketAction: (...args) => callBackend('performTicketAction', ...args),
    addComment: (...args) => callBackend('addComment', ...args),

    uploadImage: (...args) => callBackend('uploadImage', ...args),
};
