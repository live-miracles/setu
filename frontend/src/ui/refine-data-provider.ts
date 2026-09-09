import type {
    CreateParams,
    DataProvider,
    DeleteOneParams,
    GetListParams,
    GetOneParams,
    UpdateParams,
} from '@refinedev/core';
import { api } from '../api';
import { generateRequestId } from '../ids';

// One typed adapter between Refine's resource-shaped hooks (useList/useOne/
// useCreate/useUpdate/useDelete/useCustom) and Setu's operation-shaped API
// (api.ts, one function per Api interface member). Every resource gets one
// entry below instead of being scattered across five parallel per-method
// maps, and the cross-cutting bits (id field, list/getOne fallback) are
// handled once here rather than duplicated per resource.

type Row = object;

interface ListParams {
    pagination?: { currentPage?: number; pageSize?: number };
    filters?: Array<{ field?: string; value?: unknown }>;
    sorters?: Array<{ field?: string; order?: 'asc' | 'desc' }>;
}

interface ResourceConfig {
    // 'Id' for the normal case; 'Name' for the handful of settings resources
    // (ShiftType, ProgramType, ...) keyed by name instead of an Id column;
    // 'Email' for users, whose primary key is the email address itself.
    idField: 'Id' | 'Name' | 'Email';
    list: (params: ListParams) => Promise<{ data: Row[]; total: number }>;
    // Falls back to list() + find-by-id when a resource has no dedicated
    // single-record fetch (matches today's behaviour for the small tables).
    getOne?: (id: string) => Promise<Row>;
    create?: (variables: Row) => Promise<Row>;
    update?: (id: string, variables: Row) => Promise<Row>;
    deleteOne?: (id: string) => Promise<void>;
}

// Turns Refine's generic filters/sorters into the resource-specific query
// object each paginated list operation expects (InventoryRequestQuery,
// ProgramRequestQuery). Filters are passed through by field name verbatim
// (Refine's `operator` beyond plain equality isn't interpreted — Setu's
// backend queries don't support that today).
function queryFromParams<TQuery extends object>(params: ListParams): TQuery | undefined {
    const query: Record<string, unknown> = {};
    for (const filter of params.filters || []) {
        if (filter.field) query[filter.field] = filter.value;
    }
    const [sorter] = params.sorters || [];
    if (sorter?.field) {
        query.sortBy = sorter.field;
        query.sortDirection = sorter.order;
    }
    return Object.keys(query).length ? (query as TQuery) : undefined;
}

function pageFromParams(params: ListParams): number {
    return params.pagination?.currentPage ?? 1;
}

function simpleList<T extends object>(list: () => Promise<T[]>): ResourceConfig['list'] {
    return async () => {
        const data = await list();
        return { data, total: data.length };
    };
}

// The four settings resources share one backend call (getSettings) instead
// of having one each — same shape as before, just centralised.
function settingsList(pick: (settings: SettingsPayload) => Row[]): ResourceConfig['list'] {
    return async () => {
        const data = pick(await api.getSettings());
        return { data, total: data.length };
    };
}

const RESOURCES: Record<string, ResourceConfig> = {
    departments: {
        idField: 'Id',
        list: simpleList(() => api.listDepartments()),
        create: (v) =>
            api.createDepartment(v as unknown as CreateDepartmentInput, generateRequestId()),
        update: (id, v) =>
            api.updateDepartment(id, v as unknown as CreateDepartmentInput, generateRequestId()),
        deleteOne: (id) => api.deleteDepartment(id, generateRequestId()),
    },
    places: {
        idField: 'Id',
        list: simpleList(() => api.listPlaces()),
        create: (v) => api.createPlace(v as unknown as CreatePlaceInput, generateRequestId()),
        update: (id, v) =>
            api.updatePlace(id, v as unknown as CreatePlaceInput, generateRequestId()),
        deleteOne: (id) => api.deletePlace(id, generateRequestId()),
    },
    'inventory-types': {
        idField: 'Id',
        list: simpleList(() => api.listInventoryTypes()),
        create: (v) =>
            api.createInventoryType(v as unknown as CreateInventoryTypeInput, generateRequestId()),
        update: (id, v) =>
            api.updateInventoryType(
                id,
                v as unknown as CreateInventoryTypeInput,
                generateRequestId(),
            ),
        deleteOne: (id) => api.deleteInventoryType(id, generateRequestId()),
    },
    blocks: {
        idField: 'Id',
        list: simpleList(() => api.listBlocks()),
        create: (v) => api.createBlock(v as unknown as CreateBlockInput, generateRequestId()),
        update: (id, v) =>
            api.updateBlock(id, v as unknown as CreateBlockInput, generateRequestId()),
        deleteOne: (id) => api.deleteBlock(id, generateRequestId()),
    },
    users: {
        idField: 'Email',
        list: simpleList(async () => (await api.listUsers()) as unknown as Row[]),
        // No create: users self-register on first sign-in (see the
        // handle_new_user trigger) rather than being pre-provisioned.
        update: (id, v) => api.updateUser(id, v as unknown as UpdateUserInput),
        deleteOne: (id) => api.deleteUser(id, generateRequestId()),
    },
    'shift-types': {
        idField: 'Name',
        list: settingsList((s) => s.shiftTypes as unknown as Row[]),
        create: (v) =>
            api.createShiftType(v as unknown as CreateShiftTypeInput, generateRequestId()),
        update: (name, v) =>
            api.updateShiftType(name, v as unknown as CreateShiftTypeInput, generateRequestId()),
        deleteOne: (name) => api.deleteShiftType(name, generateRequestId()),
    },
    'program-types': {
        idField: 'Name',
        list: settingsList((s) => s.programTypes as unknown as Row[]),
        create: (v) =>
            api.createProgramType(v as unknown as CreateNamedOptionInput, generateRequestId()),
        update: (name, v) =>
            api.updateProgramType(
                name,
                v as unknown as CreateNamedOptionInput,
                generateRequestId(),
            ),
        deleteOne: (name) => api.deleteProgramType(name, generateRequestId()),
    },
    'program-languages': {
        idField: 'Name',
        list: settingsList((s) => s.programLanguages as unknown as Row[]),
        create: (v) =>
            api.createProgramLanguage(v as unknown as CreateNamedOptionInput, generateRequestId()),
        update: (name, v) =>
            api.updateProgramLanguage(
                name,
                v as unknown as CreateNamedOptionInput,
                generateRequestId(),
            ),
        deleteOne: (name) => api.deleteProgramLanguage(name, generateRequestId()),
    },
    'session-types': {
        idField: 'Name',
        list: settingsList((s) => s.sessionTypes as unknown as Row[]),
        create: (v) =>
            api.createSessionType(v as unknown as CreateNamedOptionInput, generateRequestId()),
        update: (name, v) =>
            api.updateSessionType(
                name,
                v as unknown as CreateNamedOptionInput,
                generateRequestId(),
            ),
        deleteOne: (name) => api.deleteSessionType(name, generateRequestId()),
    },
    rosters: {
        idField: 'Id',
        list: async (params) => {
            const result = await api.listRosters(pageFromParams(params));
            return { data: result.items as unknown as Row[], total: result.totalCount };
        },
        create: (v) => api.createRoster(v as unknown as CreateRosterInput, generateRequestId()),
        update: (id, v) =>
            api.updateRoster(id, v as unknown as CreateRosterInput, generateRequestId()),
        deleteOne: (id) => api.deleteRoster(id, generateRequestId()),
    },
    'inventory-requests': {
        idField: 'Id',
        list: async (params) => {
            const result = await api.listInventoryRequests(
                pageFromParams(params),
                queryFromParams<InventoryRequestQuery>(params),
            );
            return { data: result.items as unknown as Row[], total: result.totalCount };
        },
        getOne: (id) => api.getInventoryRequest(id) as unknown as Promise<Row>,
        create: (v) =>
            api.createInventoryRequest(
                v as unknown as CreateInventoryRequestInput,
                generateRequestId(),
            ),
        update: (id, v) =>
            api.updateInventoryRequest(
                id,
                v as unknown as UpdateInventoryRequestInput,
                generateRequestId(),
            ),
        deleteOne: (id) => api.deleteInventoryRequest(id, generateRequestId()),
    },
    'program-requests': {
        idField: 'Id',
        list: async (params) => {
            const result = await api.listProgramRequests(
                pageFromParams(params),
                queryFromParams<ProgramRequestQuery>(params),
            );
            return { data: result.items as unknown as Row[], total: result.totalCount };
        },
        getOne: (id) => api.getProgramRequest(id) as unknown as Promise<Row>,
        create: (v) =>
            api.createProgramRequest(
                v as unknown as CreateProgramRequestInput,
                generateRequestId(),
            ),
        update: (id, v) =>
            api.updateProgramRequest(
                id,
                v as unknown as UpdateProgramRequestInput,
                generateRequestId(),
            ),
        deleteOne: (id) => api.deleteProgramRequest(id, generateRequestId()),
    },
};

function requireResource(resource: string): ResourceConfig {
    const config = RESOURCES[resource];
    if (!config) throw new Error(`Unsupported Refine resource: ${resource}`);
    return config;
}

function rowValue(row: Row, field: string): unknown {
    return (row as Record<string, unknown>)[field];
}

function withId(config: ResourceConfig, row: Row): Row {
    return { ...row, id: rowValue(row, config.idField) };
}

// The provider keeps Refine resources on the same Supabase API boundary as
// the rest of the application. Authentication and authorization stay
// entirely server-side (see supabase/functions/api/index.ts) — this file
// only translates Refine's resource-shaped calls into api.ts operations.
export const setuDataProvider = {
    getApiUrl: () => 'supabase/functions/v1/api',

    getList: async ({ resource, pagination, filters, sorters }: GetListParams) => {
        const config = requireResource(resource);
        const { data, total } = await config.list({
            pagination,
            filters: filters as ListParams['filters'],
            sorters: sorters as ListParams['sorters'],
        });
        return { data: data.map((row) => withId(config, row)), total };
    },

    getOne: async ({ resource, id }: GetOneParams) => {
        const config = requireResource(resource);
        if (config.getOne) return { data: withId(config, await config.getOne(String(id))) };
        const { data } = await config.list({});
        const found = data.find((row) => String(rowValue(row, config.idField)) === String(id));
        if (!found) throw new Error(`Resource ${resource} with id ${id} was not found.`);
        return { data: withId(config, found) };
    },

    create: async ({ resource, variables }: CreateParams<Row>) => {
        const config = requireResource(resource);
        if (!config.create) throw new Error(`Resource ${resource} does not support create.`);
        return { data: withId(config, await config.create(variables as Row)) };
    },

    update: async ({ resource, id, variables }: UpdateParams<Row>) => {
        const config = requireResource(resource);
        if (!config.update) throw new Error(`Resource ${resource} does not support update.`);
        return { data: withId(config, await config.update(String(id), variables as Row)) };
    },

    deleteOne: async ({ resource, id }: DeleteOneParams) => {
        const config = requireResource(resource);
        if (!config.deleteOne) throw new Error(`Resource ${resource} does not support delete.`);
        await config.deleteOne(String(id));
        return { data: { id } };
    },

    // Escape hatch for everything that isn't plain CRUD (performInventoryRequestAction,
    // performProgramRequestAction, getCalendarMonth, uploadImage, ...):
    // useCustom/useCustomMutation call this with the operation named in
    // `meta.operation`, so those calls ride the same QueryClient cache as
    // everything else instead of bypassing it via a raw api.* call.
    custom: async ({ meta }: { meta?: { operation?: keyof Api; args?: unknown[] } }) => {
        const operation = meta?.operation;
        if (!operation) throw new Error('A custom Refine call requires meta.operation.');
        const fn = (api as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[
            operation
        ];
        if (!fn) throw new Error(`Unknown API operation: ${String(operation)}`);
        const data = await fn(...(meta?.args ?? []));
        return { data };
    },
} as unknown as DataProvider;
