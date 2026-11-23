import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4';
import { currentUser, updateOwnProfile } from './core.ts';
import { dashboard } from './dashboard.ts';
import { addComment } from './comments.ts';
import { createImageUploadUrl } from './images.ts';
import {
    createInventoryRequest,
    deleteInventoryRequest,
    getInventoryRequest,
    listInventoryRequests,
    performInventoryRequestAction,
    updateInventoryRequest,
    updateInventoryRequestParticipants,
} from './inventory.ts';
import {
    createProgramRequest,
    deleteProgramRequest,
    getAvailablePlaces,
    getCalendarMonth,
    getProgramRequest,
    listProgramRequests,
    performProgramRequestAction,
    updateProgramRequest,
    updateProgramRequestParticipants,
} from './programs.ts';
import {
    createAllowedEmailDomain,
    deleteAllowedEmailDomain,
    getHomeContent,
    getSettings,
    listAllowedEmailDomains,
    listBlocks,
    listDepartments,
    listInventoryBrands,
    listInventoryPlaces,
    listInventoryTypes,
    listPlaces,
    listUsers,
} from './reference.ts';
import { createRoster, deleteRoster, listRosters, updateRoster } from './roster.ts';
import {
    createBlock,
    createDepartment,
    createInventoryBrand,
    createInventoryLabel,
    createInventoryPlace,
    createInventoryType,
    createNamedOption,
    createPlace,
    createShiftType,
    createUser,
    deleteBlock,
    deleteDepartment,
    deleteInventoryBrand,
    deleteInventoryLabel,
    deleteInventoryPlace,
    deleteInventoryType,
    deleteNamedOption,
    deletePlace,
    deleteShiftType,
    deleteUser,
    updateBlock,
    updateDepartment,
    updateHomeContent,
    updateInventoryBrand,
    updateInventoryLabel,
    updateInventoryPlace,
    updateInventoryType,
    updateNamedOption,
    updatePlace,
    updateShiftType,
    updateUser,
} from './settings.ts';

// The one table of what the browser may ask this function to do. Each operation
// declares the positional arguments it takes (the browser's typed `Api` in
// shared/types.d.ts is the other half of that contract; api-contract.test.mjs
// keeps the two in step) and what it runs. Authentication, the allowed-domain
// check, argument validation, error statuses and the response shape are handled
// once, by handleApiRequest; an operation only does its work.
//
// Extra trailing arguments are ignored: browsers that were installed before an
// operation lost its trailing idempotency id keep working until they update.

export interface OperationContext {
    client: SupabaseClient;
    admin: SupabaseClient;
    userId: string;
}

export interface Operation {
    parse(args: unknown[]): unknown[] | null;
    run(context: OperationContext, args: unknown[]): Promise<unknown>;
}

type Outputs<S extends readonly z.ZodType[]> = { [K in keyof S]: z.output<S[K]> };

function operation<const S extends readonly z.ZodType[]>(
    schemas: S,
    run: (context: OperationContext, ...args: Outputs<S>) => Promise<unknown>,
): Operation {
    const schema = z
        .tuple([...schemas] as unknown as [z.ZodType, ...z.ZodType[]])
        .rest(z.unknown());
    return {
        parse: (args) => {
            const parsed = schema.safeParse(args);
            return parsed.success ? (parsed.data as unknown[]) : null;
        },
        run: (context, args) => run(context, ...(args as Outputs<S>)),
    };
}

const id = z.string().trim().min(1);
const text = z.string();
const optionalText = z.string().optional();
const input = z.record(z.string(), z.unknown());
const optionalInput = input.optional();
const page = z.coerce.number().int().positive().catch(1).optional();
const sessions = z.array(input).optional();

// Operations whose result is only "it worked".
const done = async (work: Promise<unknown>) => {
    await work;
    return null;
};

export const operations: Record<string, Operation> = {
    whoAmI: operation([], ({ client, userId }) => currentUser(client, userId)),
    getDashboard: operation([], ({ client, admin, userId }) => dashboard(client, admin, userId)),
    updateOwnProfile: operation([input], ({ client, admin, userId }, patch) =>
        updateOwnProfile(client, admin, userId, patch),
    ),

    // --- people and reference data -----------------------------------------
    listUsers: operation([], ({ client, userId }) => listUsers(client, userId)),
    createUser: operation([input], ({ client, admin, userId }, value) =>
        createUser(client, admin, userId, value),
    ),
    updateUser: operation([id, input], ({ client, admin, userId }, userKey, patch) =>
        updateUser(client, admin, userId, userKey, patch),
    ),
    deleteUser: operation([id], ({ client, admin, userId }, userKey) =>
        done(deleteUser(client, admin, userId, userKey)),
    ),

    listDepartments: operation([], ({ client }) => listDepartments(client)),
    createDepartment: operation([input], ({ client, admin, userId }, value) =>
        createDepartment(client, admin, userId, value),
    ),
    updateDepartment: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateDepartment(client, admin, userId, key, value),
    ),
    deleteDepartment: operation([id], ({ client, admin, userId }, key) =>
        done(deleteDepartment(client, admin, userId, key)),
    ),

    listPlaces: operation([], ({ client }) => listPlaces(client)),
    createPlace: operation([input], ({ client, admin, userId }, value) =>
        createPlace(client, admin, userId, value),
    ),
    updatePlace: operation([id, input], ({ client, admin, userId }, key, value) =>
        updatePlace(client, admin, userId, key, value),
    ),
    deletePlace: operation([id], ({ client, admin, userId }, key) =>
        done(deletePlace(client, admin, userId, key)),
    ),

    listInventoryPlaces: operation([], ({ client }) => listInventoryPlaces(client)),
    createInventoryPlace: operation([input], ({ client, admin, userId }, value) =>
        createInventoryPlace(client, admin, userId, value),
    ),
    updateInventoryPlace: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateInventoryPlace(client, admin, userId, key, value),
    ),
    deleteInventoryPlace: operation([id], ({ client, admin, userId }, key) =>
        done(deleteInventoryPlace(client, admin, userId, key)),
    ),

    listInventoryBrands: operation([], ({ client }) => listInventoryBrands(client)),
    createInventoryBrand: operation([input], ({ client, admin, userId }, value) =>
        createInventoryBrand(client, admin, userId, value),
    ),
    updateInventoryBrand: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateInventoryBrand(client, admin, userId, key, value),
    ),
    deleteInventoryBrand: operation([id], ({ client, admin, userId }, key) =>
        done(deleteInventoryBrand(client, admin, userId, key)),
    ),

    listInventoryTypes: operation([], ({ client }) => listInventoryTypes(client)),
    createInventoryType: operation([input], ({ client, admin, userId }, value) =>
        createInventoryType(client, admin, userId, value),
    ),
    updateInventoryType: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateInventoryType(client, admin, userId, key, value),
    ),
    deleteInventoryType: operation([id], ({ client, admin, userId }, key) =>
        done(deleteInventoryType(client, admin, userId, key)),
    ),
    createInventoryLabel: operation([input], ({ client, admin, userId }, value) =>
        createInventoryLabel(client, admin, userId, value),
    ),
    updateInventoryLabel: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateInventoryLabel(client, admin, userId, key, value),
    ),
    deleteInventoryLabel: operation([id], ({ client, admin, userId }, key) =>
        done(deleteInventoryLabel(client, admin, userId, key)),
    ),

    createShiftType: operation([input], ({ client, admin, userId }, value) =>
        createShiftType(client, admin, userId, value),
    ),
    updateShiftType: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateShiftType(client, admin, userId, key, value),
    ),
    deleteShiftType: operation([id], ({ client, admin, userId }, key) =>
        done(deleteShiftType(client, admin, userId, key)),
    ),

    createProgramType: operation([input], ({ client, admin, userId }, value) =>
        createNamedOption(client, admin, userId, 'program_types', 'program type', value),
    ),
    updateProgramType: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateNamedOption(client, admin, userId, 'program_types', 'program type', key, value),
    ),
    deleteProgramType: operation([id], ({ client, admin, userId }, key) =>
        done(deleteNamedOption(client, admin, userId, 'program_types', key)),
    ),
    createProgramLanguage: operation([input], ({ client, admin, userId }, value) =>
        createNamedOption(client, admin, userId, 'program_languages', 'language', value),
    ),
    updateProgramLanguage: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateNamedOption(client, admin, userId, 'program_languages', 'language', key, value),
    ),
    deleteProgramLanguage: operation([id], ({ client, admin, userId }, key) =>
        done(deleteNamedOption(client, admin, userId, 'program_languages', key)),
    ),
    createSessionType: operation([input], ({ client, admin, userId }, value) =>
        createNamedOption(client, admin, userId, 'session_types', 'session type', value),
    ),
    updateSessionType: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateNamedOption(client, admin, userId, 'session_types', 'session type', key, value),
    ),
    deleteSessionType: operation([id], ({ client, admin, userId }, key) =>
        done(deleteNamedOption(client, admin, userId, 'session_types', key)),
    ),

    listBlocks: operation([], ({ client }) => listBlocks(client)),
    createBlock: operation([input], ({ client, admin, userId }, value) =>
        createBlock(client, admin, userId, value),
    ),
    updateBlock: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateBlock(client, admin, userId, key, value),
    ),
    deleteBlock: operation([id], ({ client, admin, userId }, key) =>
        done(deleteBlock(client, admin, userId, key)),
    ),

    getSettings: operation([], ({ client }) => getSettings(client)),
    getHomeContent: operation([], ({ client }) => getHomeContent(client)),
    updateHomeContent: operation([input], ({ client, admin, userId }, value) =>
        updateHomeContent(client, admin, userId, value),
    ),
    listAllowedEmailDomains: operation([], ({ client, userId }) =>
        listAllowedEmailDomains(client, userId),
    ),
    createAllowedEmailDomain: operation([input], ({ client, admin, userId }, value) =>
        createAllowedEmailDomain(client, admin, userId, value),
    ),
    deleteAllowedEmailDomain: operation([id], ({ client, admin, userId }, domain) =>
        done(deleteAllowedEmailDomain(client, admin, userId, domain)),
    ),

    // --- rosters ------------------------------------------------------------
    listRosters: operation([page], ({ client, admin }, pageNumber) =>
        listRosters(client, admin, pageNumber ?? 1),
    ),
    createRoster: operation([input], ({ client, admin, userId }, value) =>
        createRoster(client, admin, userId, value),
    ),
    updateRoster: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateRoster(client, admin, userId, key, value),
    ),
    deleteRoster: operation([id], ({ client, admin, userId }, key) =>
        done(deleteRoster(client, admin, userId, key)),
    ),

    // --- inventory requests -------------------------------------------------
    listInventoryRequests: operation(
        [page, optionalInput],
        ({ client, admin }, pageNumber, query) =>
            listInventoryRequests(client, admin, pageNumber ?? 1, query ?? {}),
    ),
    getInventoryRequest: operation([id], ({ client, admin }, key) =>
        getInventoryRequest(client, admin, key),
    ),
    // The optional second argument is the browser's id for this submission; it
    // becomes the request's id, so a replayed create returns the same request.
    createInventoryRequest: operation(
        [input, optionalText],
        ({ client, admin, userId }, value, clientId) =>
            createInventoryRequest(client, admin, userId, value, clientId),
    ),
    updateInventoryRequest: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateInventoryRequest(client, admin, userId, key, value),
    ),
    updateInventoryRequestParticipants: operation(
        [id, input],
        ({ client, admin, userId }, key, value) =>
            updateInventoryRequestParticipants(client, admin, userId, key, value),
    ),
    deleteInventoryRequest: operation([id], ({ client, admin, userId }, key) =>
        done(deleteInventoryRequest(client, admin, userId, key)),
    ),
    performInventoryRequestAction: operation(
        [id, id, optionalText],
        ({ client, admin, userId }, key, action, note) =>
            performInventoryRequestAction(client, admin, userId, key, action, note || ''),
    ),

    // --- program requests ---------------------------------------------------
    listProgramRequests: operation([page, optionalInput], ({ client, admin }, pageNumber, query) =>
        listProgramRequests(client, admin, pageNumber ?? 1, query ?? {}),
    ),
    getProgramRequest: operation([id], ({ client, admin }, key) =>
        getProgramRequest(client, admin, key),
    ),
    getAvailablePlaces: operation([optionalText, sessions], ({ admin }, key, programSessions) =>
        getAvailablePlaces(admin, key || '', programSessions ?? []),
    ),
    getCalendarMonth: operation(
        [z.coerce.number().int(), z.coerce.number().int().min(1).max(12)],
        ({ admin }, year, month) => getCalendarMonth(admin, year, month),
    ),
    createProgramRequest: operation(
        [input, optionalText],
        ({ client, admin, userId }, value, clientId) =>
            createProgramRequest(client, admin, userId, value, clientId),
    ),
    updateProgramRequest: operation([id, input], ({ client, admin, userId }, key, value) =>
        updateProgramRequest(client, admin, userId, key, value),
    ),
    updateProgramRequestParticipants: operation(
        [id, input],
        ({ client, admin, userId }, key, value) =>
            updateProgramRequestParticipants(client, admin, userId, key, value),
    ),
    deleteProgramRequest: operation([id], ({ client, admin, userId }, key) =>
        done(deleteProgramRequest(client, admin, userId, key)),
    ),
    performProgramRequestAction: operation(
        [id, id, optionalText],
        ({ client, admin, userId }, key, action, note) =>
            performProgramRequestAction(client, admin, userId, key, action, note || ''),
    ),

    // --- comments and images ------------------------------------------------
    addComment: operation(
        [id, text, optionalText],
        ({ client, admin, userId }, key, message, clientId) =>
            addComment(client, admin, userId, key, message, clientId),
    ),
    createImageUploadUrl: operation(
        [text, text, text, text],
        ({ client, admin, userId }, fileName, mimeType, targetType, targetId) =>
            createImageUploadUrl(client, admin, userId, fileName, mimeType, targetType, targetId),
    ),
};
