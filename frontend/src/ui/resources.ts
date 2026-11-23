import { generateRequestId } from '../ids';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api';

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
// of having one each. A page that reads several of them asks at the same
// moment, so a call already in flight is shared rather than repeated.
let settingsInFlight: Promise<SettingsPayload> | null = null;
function fetchSettings(): Promise<SettingsPayload> {
    settingsInFlight ??= api.getSettings().finally(() => {
        settingsInFlight = null;
    });
    return settingsInFlight;
}

function settingsList(pick: (settings: SettingsPayload) => Row[]): ResourceConfig['list'] {
    return async () => {
        const data = pick(await fetchSettings());
        return { data, total: data.length };
    };
}

function namedOptionResource<TInput extends Row>(
    pick: (settings: SettingsPayload) => Row[],
    create: (input: TInput) => Promise<Row>,
    update: (name: string, input: TInput) => Promise<Row>,
    deleteOne: (name: string) => Promise<void>,
): ResourceConfig {
    return {
        idField: 'Name',
        list: settingsList(pick),
        create: (v) => create(v as TInput),
        update: (name, v) => update(name, v as TInput),
        deleteOne: (name) => deleteOne(name),
    };
}

const RESOURCES: Record<string, ResourceConfig> = {
    departments: {
        idField: 'Id',
        list: simpleList(() => api.listDepartments()),
        create: (v) => api.createDepartment(v as unknown as CreateDepartmentInput),
        update: (id, v) => api.updateDepartment(id, v as unknown as CreateDepartmentInput),
        deleteOne: (id) => api.deleteDepartment(id),
    },
    places: {
        idField: 'Id',
        list: simpleList(() => api.listPlaces()),
        create: (v) => api.createPlace(v as unknown as CreatePlaceInput),
        update: (id, v) => api.updatePlace(id, v as unknown as CreatePlaceInput),
        deleteOne: (id) => api.deletePlace(id),
    },
    'inventory-brands': {
        idField: 'Id',
        list: simpleList(() => api.listInventoryBrands()),
        create: (v) => api.createInventoryBrand(v as unknown as CreatePlaceInput),
        update: (id, v) => api.updateInventoryBrand(id, v as unknown as CreatePlaceInput),
        deleteOne: (id) => api.deleteInventoryBrand(id),
    },
    'inventory-places': {
        idField: 'Id',
        list: simpleList(() => api.listInventoryPlaces()),
        create: (v) => api.createInventoryPlace(v as unknown as CreatePlaceInput),
        update: (id, v) => api.updateInventoryPlace(id, v as unknown as CreatePlaceInput),
        deleteOne: (id) => api.deleteInventoryPlace(id),
    },
    'inventory-types': {
        idField: 'Id',
        list: simpleList(() => api.listInventoryTypes()),
        create: (v) => api.createInventoryType(v as unknown as CreateInventoryTypeInput),
        update: (id, v) => api.updateInventoryType(id, v as unknown as CreateInventoryTypeInput),
        deleteOne: (id) => api.deleteInventoryType(id),
    },
    blocks: {
        idField: 'Id',
        list: simpleList(() => api.listBlocks()),
        create: (v) => api.createBlock(v as unknown as CreateBlockInput),
        update: (id, v) => api.updateBlock(id, v as unknown as CreateBlockInput),
        deleteOne: (id) => api.deleteBlock(id),
    },
    users: {
        idField: 'Email',
        list: simpleList(async () => (await api.listUsers()) as unknown as Row[]),
        // Most users self-register on first sign-in (handle_new_user trigger);
        // create adds a member who has no organisation email yet.
        create: (v) => api.createUser(v as unknown as CreateUserInput),
        update: (id, v) => api.updateUser(id, v as unknown as UpdateUserInput),
        deleteOne: (id) => api.deleteUser(id),
    },
    'shift-types': namedOptionResource<CreateShiftTypeInput>(
        (s) => s.shiftTypes as unknown as Row[],
        (input) => api.createShiftType(input) as unknown as Promise<Row>,
        (name, input) => api.updateShiftType(name, input) as unknown as Promise<Row>,
        (name) => api.deleteShiftType(name),
    ),
    'program-types': namedOptionResource<CreateNamedOptionInput>(
        (s) => s.programTypes as unknown as Row[],
        (input) => api.createProgramType(input) as unknown as Promise<Row>,
        (name, input) => api.updateProgramType(name, input) as unknown as Promise<Row>,
        (name) => api.deleteProgramType(name),
    ),
    'program-languages': namedOptionResource<CreateNamedOptionInput>(
        (s) => s.programLanguages as unknown as Row[],
        (input) => api.createProgramLanguage(input) as unknown as Promise<Row>,
        (name, input) => api.updateProgramLanguage(name, input) as unknown as Promise<Row>,
        (name) => api.deleteProgramLanguage(name),
    ),
    'session-types': namedOptionResource<CreateNamedOptionInput>(
        (s) => s.sessionTypes as unknown as Row[],
        (input) => api.createSessionType(input) as unknown as Promise<Row>,
        (name, input) => api.updateSessionType(name, input) as unknown as Promise<Row>,
        (name) => api.deleteSessionType(name),
    ),
    rosters: {
        idField: 'Id',
        list: async (params) => {
            const result = await api.listRosters(pageFromParams(params));
            return { data: result.items as unknown as Row[], total: result.totalCount };
        },
        create: (v) => api.createRoster(v as unknown as CreateRosterInput),
        update: (id, v) => api.updateRoster(id, v as unknown as CreateRosterInput),
        deleteOne: (id) => api.deleteRoster(id),
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
            api.updateInventoryRequest(id, v as unknown as UpdateInventoryRequestInput),
        deleteOne: (id) => api.deleteInventoryRequest(id),
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
        update: (id, v) => api.updateProgramRequest(id, v as unknown as UpdateProgramRequestInput),
        deleteOne: (id) => api.deleteProgramRequest(id),
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
    // `staleTime: Infinity` is for reference data (see ui/reference.ts): it is
    // refetched when something invalidates it, not on every mount.
    queryOptions?: { enabled?: boolean; staleTime?: number };
}) {
    // `{ mode: 'off' }` only says "no pages", which is also what no pagination
    // means, so both spellings share one cache entry.
    const paged = pagination?.currentPage !== undefined || pagination?.pageSize !== undefined;
    const params: ListParams = { pagination: paged ? pagination : undefined, filters, sorters };
    const query = useQuery({
        queryKey: [resource, 'list', params],
        queryFn: () => listResource(resource, params) as Promise<ListResult<T>>,
        enabled: queryOptions?.enabled ?? Boolean(resource),
        ...(queryOptions?.staleTime === undefined ? {} : { staleTime: queryOptions.staleTime }),
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

// What else a save makes stale besides its own resource's queries. A request
// save changes the home screen's lists and counts ('dashboard'), and an
// inventory request also the stock left per type; a roster save changes the
// home shifts. A save to anything else (a department, place, type, user, the
// current user's profile ...) can rename things that requests and other lists
// print, so it refetches every active query, and the inactive ones the next
// time they are opened.
const DEPENDENT_QUERIES: Record<string, string[]> = {
    'inventory-requests': ['dashboard', 'inventory-types'],
    'program-requests': ['dashboard'],
    rosters: ['dashboard'],
    // A comment added elsewhere changes only the home screen's latest comments.
    dashboard: [],
};

function invalidateResource(client: QueryClient, resource: string) {
    const dependents = DEPENDENT_QUERIES[resource];
    if (!dependents) return client.invalidateQueries();
    return Promise.all(
        [resource, ...dependents].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
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
