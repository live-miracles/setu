import type { DataProvider } from '@refinedev/core';
import { api } from '../api';
import { generateRequestId } from '../ids';

// The provider keeps Refine resources on the same Apps Script transport as
// the rest of the application. It is deliberately small: these resources
// only need CRUD, while authentication and authorization stay server-side.
export const appsScriptDataProvider = {
    getApiUrl: () => 'google.script.run',
    getList: async ({ resource }: any) => {
        const lists: Record<string, () => Promise<unknown[]>> = {
            departments: () => api.listDepartments(),
            places: () => api.listPlaces(),
            'inventory-types': () => api.listInventoryTypes(),
            blocks: () => api.listBlocks(),
            'shift-presets': () => api.listShiftPresets(),
            'program-types': () => api.listProgramTypes(),
            'program-languages': () => api.listProgramLanguages(),
            'session-types': () => api.listSessionTypes(),
        };
        const data = await (lists[resource] || (() => Promise.resolve([])))();
        return {
            data: data.map((row) => ({
                ...(row as Record<string, unknown>),
                id: (row as { Id?: string }).Id,
            })),
            total: data.length,
        };
    },
    getOne: async ({ resource, id }: any) => {
        const result = await appsScriptDataProvider.getList({
            resource,
            pagination: { currentPage: 1, pageSize: 1000 },
            sorters: [],
            filters: [],
        });
        const data = result.data.find((row) => String(row.id) === String(id));
        if (!data) throw new Error(`Resource ${resource} with id ${id} was not found.`);
        return { data };
    },
    create: async ({ resource, variables }: any) => {
        const id = generateRequestId();
        const value = variables as Record<string, any>;
        const create = (
            {
                departments: () =>
                    api.createDepartment(
                        {
                            name: value.Name,
                            shortName: value.ShortName || '',
                            leadEmail: value.LeadEmail || '',
                        },
                        id,
                    ),
                places: () => api.createPlace({ name: value.Name }, id),
                'inventory-types': () =>
                    api.createInventoryType(
                        {
                            name: value.Name,
                            description: value.Description || '',
                            requestable: true,
                            totalQuantity: Number(value.TotalQuantity || 0),
                        },
                        id,
                    ),
                blocks: () =>
                    api.createBlock(
                        {
                            name: value.Name,
                            startDateTime: value.StartDateTime,
                            endDateTime: value.EndDateTime,
                            place: value.Place || '',
                        },
                        id,
                    ),
                'shift-presets': () =>
                    api.createShiftPreset(
                        {
                            name: value.Name,
                            defaultStartTime: value.DefaultStartTime,
                            defaultEndTime: value.DefaultEndTime,
                        },
                        id,
                    ),
                'program-types': () => api.createProgramType({ name: value.Name }, id),
                'program-languages': () => api.createProgramLanguage({ name: value.Name }, id),
                'session-types': () => api.createSessionType({ name: value.Name }, id),
            } as Record<string, () => Promise<any>>
        )[resource];
        if (!create) throw new Error(`Unsupported Refine resource: ${resource}`);
        const data = await create();
        return { data: { ...data, id: (data as { Id?: string }).Id } };
    },
    update: async ({ resource, id, variables }: any) => {
        const value = variables as Record<string, any>;
        const update = (
            {
                departments: () =>
                    api.updateDepartment(
                        String(id),
                        {
                            name: value.Name,
                            shortName: value.ShortName || '',
                            leadEmail: value.LeadEmail || '',
                        },
                        generateRequestId(),
                    ),
                places: () =>
                    api.updatePlace(String(id), { name: value.Name }, generateRequestId()),
                'inventory-types': () =>
                    api.updateInventoryType(
                        String(id),
                        {
                            name: value.Name,
                            description: value.Description || '',
                            requestable: true,
                            totalQuantity: Number(value.TotalQuantity || 0),
                        },
                        generateRequestId(),
                    ),
                blocks: () =>
                    api.updateBlock(
                        String(id),
                        {
                            name: value.Name,
                            startDateTime: value.StartDateTime,
                            endDateTime: value.EndDateTime,
                            place: value.Place || '',
                        },
                        generateRequestId(),
                    ),
                'shift-presets': () =>
                    api.updateShiftPreset(
                        String(id),
                        {
                            name: value.Name,
                            defaultStartTime: value.DefaultStartTime,
                            defaultEndTime: value.DefaultEndTime,
                        },
                        generateRequestId(),
                    ),
                'program-types': () =>
                    api.updateProgramType(String(id), { name: value.Name }, generateRequestId()),
                'program-languages': () =>
                    api.updateProgramLanguage(
                        String(id),
                        { name: value.Name },
                        generateRequestId(),
                    ),
                'session-types': () =>
                    api.updateSessionType(String(id), { name: value.Name }, generateRequestId()),
            } as Record<string, () => Promise<any>>
        )[resource];
        if (!update) throw new Error(`Unsupported Refine resource: ${resource}`);
        const data = await update();
        return { data: { ...data, id: (data as { Id?: string }).Id } };
    },
    deleteOne: async ({ resource, id }: any) => {
        const remove = (
            {
                departments: () => api.deleteDepartment(String(id), generateRequestId()),
                places: () => api.deletePlace(String(id), generateRequestId()),
                'inventory-types': () => api.deleteInventoryType(String(id), generateRequestId()),
                blocks: () => api.deleteBlock(String(id), generateRequestId()),
                'shift-presets': () => api.deleteShiftPreset(String(id), generateRequestId()),
                'program-types': () => api.deleteProgramType(String(id), generateRequestId()),
                'program-languages': () =>
                    api.deleteProgramLanguage(String(id), generateRequestId()),
                'session-types': () => api.deleteSessionType(String(id), generateRequestId()),
            } as Record<string, () => Promise<any>>
        )[resource];
        if (!remove) throw new Error(`Unsupported Refine resource: ${resource}`);
        await remove();
        return { data: { id } };
    },
} as unknown as DataProvider;
