import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { generateRequestId } from '../ids';

// One typed adapter between resource-shaped hooks (useList/useOne/useCreate/
// useUpdate/useDelete, built on react-query below) and Setu's operation-shaped
// API (api.ts, one function per Api interface member). Every resource gets one
// entry below instead of being scattered across parallel per-method maps, and
// the cross-cutting bits (id field, list/getOne fallback) are handled once
// here rather than duplicated per resource.

type Row = object;

export interface ListParams {
    // `mode: 'off'` (the default) fetches the whole resource; pages are only
    // requested for the paginated request lists.
    pagination?: { currentPage?: number; pageSize?: number; mode?: 'off' };
    filters?: Array<{ field?: string; value?: unknown; operator?: 'eq' }>;
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

// Turns generic filters/sorters into the resource-specific query
// object each paginated list operation expects (InventoryRequestQuery,
// ProgramRequestQuery). Filters are passed through by field name verbatim
// (only plain equality is supported — Setu's backend queries don't need more).
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

function namedOptionResource<TInput extends Row>(
    pick: (settings: SettingsPayload) => Row[],
    create: (input: TInput, requestId: string) => Promise<Row>,
    update: (name: string, input: TInput, requestId: string) => Promise<Row>,
    deleteOne: (name: string, requestId: string) => Promise<void>,
): ResourceConfig {
    return {
        idField: 'Name',
        list: settingsList(pick),
        create: (v) => create(v as TInput, generateRequestId()),
        update: (name, v) => update(name, v as TInput, generateRequestId()),
        deleteOne: (name) => deleteOne(name, generateRequestId()),
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
    'inventory-brands': {
        idField: 'Id',
        list: simpleList(() => api.listInventoryBrands()),
        create: (v) =>
            api.createInventoryBrand(v as unknown as CreatePlaceInput, generateRequestId()),
        update: (id, v) =>
            api.updateInventoryBrand(id, v as unknown as CreatePlaceInput, generateRequestId()),
        deleteOne: (id) => api.deleteInventoryBrand(id, generateRequestId()),
    },
    'inventory-places': {
        idField: 'Id',
        list: simpleList(() => api.listInventoryPlaces()),
        create: (v) =>
            api.createInventoryPlace(v as unknown as CreatePlaceInput, generateRequestId()),
        update: (id, v) =>
            api.updateInventoryPlace(id, v as unknown as CreatePlaceInput, generateRequestId()),
        deleteOne: (id) => api.deleteInventoryPlace(id, generateRequestId()),
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
    'shift-types': namedOptionResource<CreateShiftTypeInput>(
        (s) => s.shiftTypes as unknown as Row[],
        (input, requestId) => api.createShiftType(input, requestId) as unknown as Promise<Row>,
        (name, input, requestId) =>
            api.updateShiftType(name, input, requestId) as unknown as Promise<Row>,
        (name, requestId) => api.deleteShiftType(name, requestId),
    ),
    'program-types': namedOptionResource<CreateNamedOptionInput>(
        (s) => s.programTypes as unknown as Row[],
        (input, requestId) => api.createProgramType(input, requestId) as unknown as Promise<Row>,
        (name, input, requestId) =>
            api.updateProgramType(name, input, requestId) as unknown as Promise<Row>,
        (name, requestId) => api.deleteProgramType(name, requestId),
    ),
    'program-languages': namedOptionResource<CreateNamedOptionInput>(
        (s) => s.programLanguages as unknown as Row[],
        (input, requestId) =>
            api.createProgramLanguage(input, requestId) as unknown as Promise<Row>,
        (name, input, requestId) =>
            api.updateProgramLanguage(name, input, requestId) as unknown as Promise<Row>,
        (name, requestId) => api.deleteProgramLanguage(name, requestId),
    ),
    'session-types': namedOptionResource<CreateNamedOptionInput>(
        (s) => s.sessionTypes as unknown as Row[],
        (input, requestId) => api.createSessionType(input, requestId) as unknown as Promise<Row>,
        (name, input, requestId) =>
            api.updateSessionType(name, input, requestId) as unknown as Promise<Row>,
        (name, requestId) => api.deleteSessionType(name, requestId),
    ),
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
            return {
                data: result.items as unknown as Row[],
                total: result.totalCount,
                statusCounts: result.statusCounts,
            };
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
    if (!config) throw new Error(`Unsupported resource: ${resource}`);
    return config;
}

function rowValue(row: Row, field: string): unknown {
    return (row as Record<string, unknown>)[field];
}

function withId(config: ResourceConfig, row: Row): Row {
    return { ...row, id: rowValue(row, config.idField) };
}

async function listResource(resource: string, params: ListParams) {
    const config = requireResource(resource);
    const { data, total, ...extra } = (await config.list(params)) as {
        data: Row[];
        total: number;
        statusCounts?: Record<string, number>;
    };
    return { data: data.map((row) => withId(config, row)), total, ...extra };
}

async function getOneResource(resource: string, id: string) {
    const config = requireResource(resource);
    if (config.getOne) return withId(config, await config.getOne(id));
    const { data } = await config.list({});
    const found = data.find((row) => String(rowValue(row, config.idField)) === id);
    if (!found) throw new Error(`Resource ${resource} with id ${id} was not found.`);
    return withId(config, found);
}

// Hooks. Query keys start with the resource name so one prefix invalidation
// (see useInvalidate) refreshes every list/detail view of that resource.
// There are no notification toasts: callers report failures themselves.

type ListResult<T> = { data: T[]; total: number; statusCounts?: Record<string, number> };

export function useList<T = Row>({
    resource,
    pagination,
    filters,
    sorters,
    queryOptions,
}: {
    resource: string;
    pagination?: ListParams['pagination'];
    filters?: ListParams['filters'];
    sorters?: ListParams['sorters'];
    queryOptions?: { enabled?: boolean };
}) {
    const params: ListParams = { pagination, filters, sorters };
    const query = useQuery({
        queryKey: [resource, 'list', params],
        queryFn: () => listResource(resource, params) as Promise<ListResult<T>>,
        enabled: queryOptions?.enabled ?? Boolean(resource),
    });
    const empty: ListResult<T> = { data: [], total: 0 };
    return { query, result: query.data ?? empty };
}

export function useOne<T = Row>({ resource, id }: { resource: string; id: string }) {
    const query = useQuery({
        queryKey: [resource, 'one', id],
        queryFn: () => getOneResource(resource, id) as Promise<T>,
    });
    return { query, result: query.data };
}

// For operations that aren't plain CRUD (getCalendarMonth, ...): runs the named
// api.ts operation, cached per (operation, args) so revisiting a month is instant.
export function useApiQuery<K extends keyof Api>(operation: K, ...args: Parameters<Api[K]>) {
    return useQuery({
        queryKey: ['api', operation, args],
        queryFn: () =>
            (api[operation] as (...a: unknown[]) => Promise<unknown>)(...args) as Promise<
                Awaited<ReturnType<Api[K]>>
            >,
    });
}

function invalidateResource(client: QueryClient, resource: string) {
    return client.invalidateQueries({ queryKey: [resource] });
}

export function useInvalidate() {
    const client = useQueryClient();
    return ({ resource }: { resource: string }) => invalidateResource(client, resource);
}

export function useCreate() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: async ({ resource, values }: { resource: string; values: Row }) => {
            const config = requireResource(resource);
            if (!config.create) throw new Error(`Resource ${resource} does not support create.`);
            return { data: withId(config, await config.create(values)) };
        },
        onSuccess: (_result, { resource }) => invalidateResource(client, resource),
    });
}

export function useUpdate() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: async ({
            resource,
            id,
            values,
        }: {
            resource: string;
            id: string;
            values: Row;
        }) => {
            const config = requireResource(resource);
            if (!config.update) throw new Error(`Resource ${resource} does not support update.`);
            return { data: withId(config, await config.update(String(id), values)) };
        },
        onSuccess: (_result, { resource }) => invalidateResource(client, resource),
    });
}

export function useDelete() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: async ({ resource, id }: { resource: string; id: string }) => {
            const config = requireResource(resource);
            if (!config.deleteOne) throw new Error(`Resource ${resource} does not support delete.`);
            await config.deleteOne(String(id));
            return { data: { id } };
        },
        onSuccess: (_result, { resource }) => invalidateResource(client, resource),
    });
}
