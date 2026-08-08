import type { DataProvider } from 'react-admin';
import { appsScriptClient } from './apps-script-client';

type Resource =
    | 'users'
    | 'departments'
    | 'places'
    | 'inventory-types'
    | 'links'
    | 'shift-presets'
    | 'program-types'
    | 'program-languages'
    | 'session-types'
    | 'blocks'
    | 'tickets'
    | 'inventory-requests'
    | 'program-requests'
    | 'rosters';

type RecordValue = Record<string, unknown> & { Id?: string; id?: string };

const resources: Record<
    Resource,
    {
        list: () => Promise<unknown[]>;
        create: (data: RecordValue, requestId: string) => Promise<unknown>;
        update: (id: string, data: RecordValue, requestId: string) => Promise<unknown>;
        remove: (id: string, requestId: string) => Promise<unknown>;
        getOne?: (id: string) => Promise<unknown>;
    }
> = {
    users: {
        list: () => appsScriptClient.listUsers(),
        create: (data, requestId) =>
            appsScriptClient.createUser(
                {
                    email: String(data.Email || ''),
                    name: String(data.Name || ''),
                    role: String(data.Role || 'user') as UserRole,
                    departmentId: String(data.DepartmentId || ''),
                    phone: String(data.Phone || ''),
                    whatsapp: String(data.Whatsapp || ''),
                },
                requestId,
            ),
        update: (id, data) =>
            appsScriptClient.updateUser(id, {
                name: String(data.Name || ''),
                role: String(data.Role || 'user') as UserRole,
                departmentId: String(data.DepartmentId || ''),
                phone: String(data.Phone || ''),
                whatsapp: String(data.Whatsapp || ''),
            }),
        remove: async () => {
            throw new Error('Users are managed through your Google Workspace domain.');
        },
    },
    departments: {
        list: () => appsScriptClient.listDepartments(),
        create: (data, requestId) =>
            appsScriptClient.createDepartment(
                {
                    name: String(data.Name || ''),
                    shortName: String(data.ShortName || ''),
                    leadEmail: String(data.LeadEmail || ''),
                },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateDepartment(
                id,
                {
                    name: String(data.Name || ''),
                    shortName: String(data.ShortName || ''),
                    leadEmail: String(data.LeadEmail || ''),
                },
                requestId,
            ),
        remove: (id, requestId) => appsScriptClient.deleteDepartment(id, requestId),
    },
    places: {
        list: () => appsScriptClient.listPlaces(),
        create: (data, requestId) => appsScriptClient.createPlace({ name: String(data.Name || '') }, requestId),
        update: (id, data, requestId) => appsScriptClient.updatePlace(id, { name: String(data.Name || '') }, requestId),
        remove: (id, requestId) => appsScriptClient.deletePlace(id, requestId),
    },
    'inventory-types': {
        list: () => appsScriptClient.listInventoryTypes(),
        create: (data, requestId) =>
            appsScriptClient.createInventoryType(
                {
                    name: String(data.Name || ''),
                    description: String(data.Description || ''),
                    requestable: true,
                    totalQuantity: Number(data.TotalQuantity || 0),
                },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateInventoryType(
                id,
                {
                    name: String(data.Name || ''),
                    description: String(data.Description || ''),
                    requestable: true,
                    totalQuantity: Number(data.TotalQuantity || 0),
                },
                requestId,
            ),
        remove: (id, requestId) => appsScriptClient.deleteInventoryType(id, requestId),
    },
    links: {
        list: () => appsScriptClient.listLinks(),
        create: (data, requestId) =>
            appsScriptClient.createLink(
                { name: String(data.Name || ''), url: String(data.Url || ''), enabled: true },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateLink(
                id,
                { name: String(data.Name || ''), url: String(data.Url || ''), enabled: true },
                requestId,
            ),
        remove: (id, requestId) => appsScriptClient.deleteLink(id, requestId),
    },
    'shift-presets': {
        list: () => appsScriptClient.listShiftPresets(),
        create: (data, requestId) =>
            appsScriptClient.createShiftPreset(
                {
                    name: String(data.Name || ''),
                    defaultStartTime: String(data.DefaultStartTime || ''),
                    defaultEndTime: String(data.DefaultEndTime || ''),
                },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateShiftPreset(
                id,
                {
                    name: String(data.Name || ''),
                    defaultStartTime: String(data.DefaultStartTime || ''),
                    defaultEndTime: String(data.DefaultEndTime || ''),
                },
                requestId,
            ),
        remove: (id, requestId) => appsScriptClient.deleteShiftPreset(id, requestId),
    },
    'program-types': {
        list: () => appsScriptClient.listProgramTypes(),
        create: (data, requestId) => appsScriptClient.createProgramType({ name: String(data.Name || '') }, requestId),
        update: (id, data, requestId) => appsScriptClient.updateProgramType(id, { name: String(data.Name || '') }, requestId),
        remove: (id, requestId) => appsScriptClient.deleteProgramType(id, requestId),
    },
    'program-languages': {
        list: () => appsScriptClient.listProgramLanguages(),
        create: (data, requestId) => appsScriptClient.createProgramLanguage({ name: String(data.Name || '') }, requestId),
        update: (id, data, requestId) => appsScriptClient.updateProgramLanguage(id, { name: String(data.Name || '') }, requestId),
        remove: (id, requestId) => appsScriptClient.deleteProgramLanguage(id, requestId),
    },
    'session-types': {
        list: () => appsScriptClient.listSessionTypes(),
        create: (data, requestId) => appsScriptClient.createSessionType({ name: String(data.Name || '') }, requestId),
        update: (id, data, requestId) => appsScriptClient.updateSessionType(id, { name: String(data.Name || '') }, requestId),
        remove: (id, requestId) => appsScriptClient.deleteSessionType(id, requestId),
    },
    blocks: {
        list: () => appsScriptClient.listBlocks(),
        create: (data, requestId) =>
            appsScriptClient.createBlock(
                {
                    name: String(data.Name || ''),
                    startDateTime: String(data.StartDateTime || ''),
                    endDateTime: String(data.EndDateTime || ''),
                    place: String(data.Place || ''),
                },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateBlock(
                id,
                {
                    name: String(data.Name || ''),
                    startDateTime: String(data.StartDateTime || ''),
                    endDateTime: String(data.EndDateTime || ''),
                    place: String(data.Place || ''),
                },
                requestId,
            ),
        remove: (id, requestId) => appsScriptClient.deleteBlock(id, requestId),
    },
    tickets: {
        list: async () => (await appsScriptClient.listTickets(1, {})).items,
        getOne: (id) => appsScriptClient.getTicket(id),
        create: (data, requestId) =>
            appsScriptClient.createTicket(
                { title: String(data.Title || ''), description: String(data.Description || '') },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateTicket(
                id,
                { title: String(data.Title || ''), description: String(data.Description || '') },
                requestId,
            ),
        remove: async () => {
            throw new Error('Tickets cannot be deleted. Close or reopen the ticket instead.');
        },
    },
    'inventory-requests': {
        list: async () => (await appsScriptClient.listInventoryRequests(1, {})).items,
        getOne: (id) => appsScriptClient.getInventoryRequest(id),
        create: (data, requestId) =>
            appsScriptClient.createInventoryRequest(
                {
                    name: String(data.Name || ''),
                    userId: String(data.UserId || ''),
                    startDate: String(data.StartDate || ''),
                    endDate: String(data.EndDate || ''),
                    departmentId: String(data.DepartmentId || ''),
                    leadEmail: String(data.LeadEmail || ''),
                    participants: String(data.Participants || ''),
                    imageId: '',
                    items: (Array.isArray(data.Items) ? data.Items : []).map((item) => ({
                        inventoryTypeId: String((item as RecordValue).InventoryTypeId || ''),
                        quantity: Number((item as RecordValue).Quantity || 0),
                        condition: String((item as RecordValue).Condition || '') as ReturnCondition | '',
                    })),
                },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateInventoryRequest(
                id,
                {
                    name: String(data.Name || ''),
                    userId: String(data.UserId || ''),
                    startDate: String(data.StartDate || ''),
                    endDate: String(data.EndDate || ''),
                    departmentId: String(data.DepartmentId || ''),
                    leadEmail: String(data.LeadEmail || ''),
                    participants: String(data.Participants || ''),
                    items: (Array.isArray(data.Items) ? data.Items : []).map((item) => ({
                        inventoryTypeId: String((item as RecordValue).InventoryTypeId || ''),
                        quantity: Number((item as RecordValue).Quantity || 0),
                        condition: String((item as RecordValue).Condition || '') as ReturnCondition | '',
                    })),
                },
                requestId,
            ),
        remove: async () => {
            throw new Error('Requests are cancelled or closed through workflow actions.');
        },
    },
    'program-requests': {
        list: async () => (await appsScriptClient.listProgramRequests(1, {})).items,
        getOne: (id) => appsScriptClient.getProgramRequest(id),
        create: (data, requestId) =>
            appsScriptClient.createProgramRequest(
                {
                    name: String(data.Name || ''),
                    language: String(data.Language || ''),
                    type: String(data.Type || ''),
                    userId: String(data.UserId || ''),
                    placeId: String(data.PlaceId || ''),
                    departmentId: String(data.DepartmentId || ''),
                    leadEmail: String(data.LeadEmail || ''),
                    participants: String(data.Participants || ''),
                    sessions: (Array.isArray(data.Sessions) ? data.Sessions : []).map((session) => ({
                        name: String((session as RecordValue).Name || ''),
                        type: String((session as RecordValue).Type || ''),
                        startDateTime: String((session as RecordValue).StartDateTime || ''),
                        endDateTime: String((session as RecordValue).EndDateTime || ''),
                    })),
                },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateProgramRequest(
                id,
                {
                    name: String(data.Name || ''),
                    language: String(data.Language || ''),
                    type: String(data.Type || ''),
                    userId: String(data.UserId || ''),
                    placeId: String(data.PlaceId || ''),
                    departmentId: String(data.DepartmentId || ''),
                    leadEmail: String(data.LeadEmail || ''),
                    participants: String(data.Participants || ''),
                    sessions: (Array.isArray(data.Sessions) ? data.Sessions : []).map((session) => ({
                        name: String((session as RecordValue).Name || ''),
                        type: String((session as RecordValue).Type || ''),
                        startDateTime: String((session as RecordValue).StartDateTime || ''),
                        endDateTime: String((session as RecordValue).EndDateTime || ''),
                    })),
                },
                requestId,
            ),
        remove: async () => {
            throw new Error('Requests are cancelled or closed through workflow actions.');
        },
    },
    rosters: {
        list: async () => (await appsScriptClient.listRosters(1)).items,
        create: (data, requestId) =>
            appsScriptClient.createRoster(
                {
                    name: String(data.Name || ''),
                    startDate: String(data.StartDate || ''),
                    endDate: String(data.EndDate || ''),
                    startTime: String(data.StartTime || ''),
                    endTime: String(data.EndTime || ''),
                    userId: String(data.UserId || ''),
                },
                requestId,
            ),
        update: (id, data, requestId) =>
            appsScriptClient.updateRoster(
                id,
                {
                    name: String(data.Name || ''),
                    startDate: String(data.StartDate || ''),
                    endDate: String(data.EndDate || ''),
                    startTime: String(data.StartTime || ''),
                    endTime: String(data.EndTime || ''),
                    userId: String(data.UserId || ''),
                },
                requestId,
            ),
        remove: (id, requestId) => appsScriptClient.deleteRoster(id, requestId),
    },
};

function requestId(): string {
    return `react-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withId(value: unknown): RecordValue {
    const record = value as RecordValue;
    return { ...record, id: String(record.Id || record.id || '') };
}

const rawDataProvider = {
    getList: async (resource: string) => {
        const config = resources[resource as Resource];
        if (!config) throw new Error(`Unsupported resource: ${resource}`);
        const data = (await config.list()).map(withId);
        return { data, total: data.length };
    },
    getOne: async (resource: string, { id }: { id: string | number }) => {
        const config = resources[resource as Resource];
        if (!config) throw new Error(`Unsupported resource: ${resource}`);
        const data = config.getOne
            ? withId(await config.getOne(String(id)))
            : (await config.list()).map(withId).find((item) => item.id === String(id));
        if (!data) throw new Error(`${resource} record not found`);
        return { data };
    },
    create: async (resource: string, { data }: { data: RecordValue }) => {
        const config = resources[resource as Resource];
        if (!config) throw new Error(`Unsupported resource: ${resource}`);
        return { data: withId(await config.create(data, requestId())) };
    },
    update: async (
        resource: string,
        { id, data }: { id: string | number; data: RecordValue },
    ) => {
        const config = resources[resource as Resource];
        if (!config) throw new Error(`Unsupported resource: ${resource}`);
        return { data: withId(await config.update(String(id), data, requestId())) };
    },
    delete: async (resource: string, { id }: { id: string | number }) => {
        const config = resources[resource as Resource];
        if (!config) throw new Error(`Unsupported resource: ${resource}`);
        await config.remove(String(id), requestId());
        return { data: { id: String(id) } };
    },
    performTicketAction: async (
        _resource: string,
        { id, action, assigneeId, requestId }: { id: string; action: TicketAction; assigneeId: string | null; requestId: string },
    ) => appsScriptClient.performTicketAction(id, action, assigneeId, requestId),
    performInventoryRequestAction: async (
        _resource: string,
        params: { id: string; action: InventoryRequestAction; note: string; returnItems: ReturnItemInput[] | null; requestId: string },
    ) => appsScriptClient.performInventoryRequestAction(params.id, params.action, params.note, params.returnItems, params.requestId),
    performProgramRequestAction: async (
        _resource: string,
        params: { id: string; action: ProgramRequestAction; note: string; requestId: string },
    ) => appsScriptClient.performProgramRequestAction(params.id, params.action, params.note, params.requestId),
};

// The provider normalises Apps Script DTOs to React Admin records by adding
// `id`. React Admin's generic method signatures cannot infer that conversion
// from the resource string, so the boundary is intentionally cast once here
// rather than weakening every resource component.
export const dataProvider = rawDataProvider as unknown as DataProvider;
