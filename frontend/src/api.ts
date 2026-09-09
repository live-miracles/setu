import { supabase, supabaseHttpConfig } from './supabase';

// The UI talks to exactly one application API: the protected Supabase Edge
// Function. Local development uses the same path as Vercel, so the database,
// RLS policies and backend implementation are always the source of truth.

type AsyncApi = { [K in keyof Api]: (...args: Parameters<Api[K]>) => Promise<ReturnType<Api[K]>> };

function callBackend<K extends keyof Api>(
    fnName: K,
    ...args: Parameters<Api[K]>
): Promise<ReturnType<Api[K]>> {
    return supabase()
        .auth.getSession()
        .then(async ({ data: sessionData, error: sessionError }) => {
            if (sessionError) throw sessionError;
            const token = sessionData.session?.access_token;
            if (!token) throw new Error(`${String(fnName)}: authentication is required`);
            const { url, publishableKey } = supabaseHttpConfig();
            const response = await fetch(`${url}/functions/v1/api/${String(fnName)}`, {
                method: 'POST',
                headers: {
                    apikey: publishableKey,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ args }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok)
                throw new Error(
                    `${String(fnName)} (HTTP ${response.status}): ${data?.error || 'Unable to complete the request.'}`,
                );
            return data as ReturnType<Api[K]>;
        });
}

export const api: AsyncApi = {
    whoAmI: (...args) => callBackend('whoAmI', ...args),
    getDashboard: (...args) => callBackend('getDashboard', ...args),

    listUsers: (...args) => callBackend('listUsers', ...args),
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

    addComment: (...args) => callBackend('addComment', ...args),

    uploadImage: (...args) => callBackend('uploadImage', ...args),
    createImageUploadUrl: (...args) => callBackend('createImageUploadUrl', ...args),
    getImageUrl: (...args) => callBackend('getImageUrl', ...args),
};
