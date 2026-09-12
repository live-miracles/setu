import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Context } from 'npm:hono@4';
import { parseApiRequest } from './validation.ts';
import { currentUser, requireAllowedEmailDomain, type Row, updateOwnProfile } from './core.ts';
import {
    createBlock,
    createDepartment,
    createInventoryType,
    createNamedOption,
    createPlace,
    createShiftType,
    deleteBlock,
    deleteDepartment,
    deleteInventoryType,
    deleteNamedOption,
    deletePlace,
    deleteShiftType,
    deleteUser,
    updateBlock,
    updateDepartment,
    updateHomeContent,
    updateInventoryType,
    updateNamedOption,
    updatePlace,
    updateShiftType,
    updateUser,
} from './settings.ts';
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
import { addComment } from './comments.ts';
import { createImageUploadUrl, getImageUrl, uploadImage } from './images.ts';
import { createRoster, deleteRoster, listRosters, updateRoster } from './roster.ts';
import {
    createAllowedEmailDomain,
    deleteAllowedEmailDomain,
    getHomeContent,
    getSettings,
    listAllowedEmailDomains,
    listBlocks,
    listDepartments,
    listInventoryTypes,
    listPlaces,
    listUsers,
} from './reference.ts';
import { dashboard } from './dashboard.ts';

const appOrigin = Deno.env.get('SETU_APP_ORIGIN') || '';

function respond(value: unknown, status = 200): Response {
    return Response.json(value, { status });
}
export async function handleApiRequest(context: Context): Promise<Response> {
    const request = context.req.raw;
    if (!appOrigin) return respond({ error: 'SETU_APP_ORIGIN is not configured.' }, 500);
    const authorization = request.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!authorization || !url || !key || !serviceKey)
        return respond({ error: 'Server authentication is not configured.' }, 500);
    const client = createClient(url, key, {
        global: { headers: { Authorization: authorization } },
    });
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return respond({ error: 'Authentication is required.' }, 401);
    const pathOperation = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop() || '';
    let body: ReturnType<typeof parseApiRequest>;
    try {
        body = parseApiRequest(await request.json());
    } catch (error) {
        return respond(
            { error: error instanceof Error ? error.message : 'The request body is invalid.' },
            400,
        );
    }
    if (!body.operation && pathOperation && pathOperation !== 'api') body.operation = pathOperation;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const args = body.args || [];
    try {
        await requireAllowedEmailDomain(admin, authData.user.email || '');
        const operationHandler = operationHandlers[body.operation || ''];
        if (!operationHandler) {
            return respond(
                {
                    error: `The ${String(body.operation || '')} operation has not been migrated yet.`,
                },
                501,
            );
        }
        return await operationHandler({ client, admin, userId: authData.user.id, args });
    } catch (error) {
        console.error(error);
        return respond(
            { error: error instanceof Error ? error.message : 'Unable to complete the request.' },
            400,
        );
    }
}
type OperationContext = {
    client: SupabaseClient;
    admin: SupabaseClient;
    userId: string;
    args: unknown[];
};

type OperationHandler = (context: OperationContext) => Promise<Response>;

const operationHandlers: Record<string, OperationHandler> = {
    whoAmI: async ({ client, admin, userId, args }) => {
        return respond(await currentUser(client, userId));
    },

    getDashboard: async ({ client, admin, userId, args }) => {
        return respond(await dashboard(client, admin, userId));
    },

    updateOwnProfile: async ({ client, admin, userId, args }) => {
        return respond(await updateOwnProfile(client, admin, userId, args[0]));
    },

    createDepartment: async ({ client, admin, userId, args }) => {
        return respond(
            await createDepartment(client, admin, userId, args[0] as Row, String(args[1])),
        );
    },

    updateDepartment: async ({ client, admin, userId, args }) => {
        return respond(
            await updateDepartment(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteDepartment: async ({ client, admin, userId, args }) => {
        await deleteDepartment(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    createPlace: async ({ client, admin, userId, args }) => {
        return respond(await createPlace(client, admin, userId, args[0] as Row, String(args[1])));
    },

    updatePlace: async ({ client, admin, userId, args }) => {
        return respond(
            await updatePlace(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deletePlace: async ({ client, admin, userId, args }) => {
        await deletePlace(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    createInventoryType: async ({ client, admin, userId, args }) => {
        return respond(
            await createInventoryType(client, admin, userId, args[0] as Row, String(args[1])),
        );
    },

    updateInventoryType: async ({ client, admin, userId, args }) => {
        return respond(
            await updateInventoryType(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteInventoryType: async ({ client, admin, userId, args }) => {
        await deleteInventoryType(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    updateUser: async ({ client, admin, userId, args }) => {
        return respond(await updateUser(client, admin, userId, String(args[0]), args[1] as Row));
    },

    deleteUser: async ({ client, admin, userId, args }) => {
        await deleteUser(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    createShiftType: async ({ client, admin, userId, args }) => {
        return respond(
            await createShiftType(client, admin, userId, args[0] as Row, String(args[1])),
        );
    },

    updateShiftType: async ({ client, admin, userId, args }) => {
        return respond(
            await updateShiftType(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteShiftType: async ({ client, admin, userId, args }) => {
        await deleteShiftType(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    createProgramType: async ({ client, admin, userId, args }) => {
        return respond(
            await createNamedOption(
                client,
                admin,
                userId,
                'program_types',
                'program-type',
                'program type',
                args[0] as Row,
                String(args[1]),
            ),
        );
    },

    updateProgramType: async ({ client, admin, userId, args }) => {
        return respond(
            await updateNamedOption(
                client,
                admin,
                userId,
                'program_types',
                'program-type',
                'program type',
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteProgramType: async ({ client, admin, userId, args }) => {
        await deleteNamedOption(
            client,
            admin,
            userId,
            'program_types',
            'program-type',
            String(args[0]),
            String(args[1]),
        );
        return respond(null);
    },

    createProgramLanguage: async ({ client, admin, userId, args }) => {
        return respond(
            await createNamedOption(
                client,
                admin,
                userId,
                'program_languages',
                'program-language',
                'language',
                args[0] as Row,
                String(args[1]),
            ),
        );
    },

    updateProgramLanguage: async ({ client, admin, userId, args }) => {
        return respond(
            await updateNamedOption(
                client,
                admin,
                userId,
                'program_languages',
                'program-language',
                'language',
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteProgramLanguage: async ({ client, admin, userId, args }) => {
        await deleteNamedOption(
            client,
            admin,
            userId,
            'program_languages',
            'program-language',
            String(args[0]),
            String(args[1]),
        );
        return respond(null);
    },

    createSessionType: async ({ client, admin, userId, args }) => {
        return respond(
            await createNamedOption(
                client,
                admin,
                userId,
                'session_types',
                'session-type',
                'session type',
                args[0] as Row,
                String(args[1]),
            ),
        );
    },

    updateSessionType: async ({ client, admin, userId, args }) => {
        return respond(
            await updateNamedOption(
                client,
                admin,
                userId,
                'session_types',
                'session-type',
                'session type',
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteSessionType: async ({ client, admin, userId, args }) => {
        await deleteNamedOption(
            client,
            admin,
            userId,
            'session_types',
            'session-type',
            String(args[0]),
            String(args[1]),
        );
        return respond(null);
    },

    createBlock: async ({ client, admin, userId, args }) => {
        return respond(await createBlock(client, admin, userId, args[0] as Row, String(args[1])));
    },

    updateBlock: async ({ client, admin, userId, args }) => {
        return respond(
            await updateBlock(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteBlock: async ({ client, admin, userId, args }) => {
        await deleteBlock(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    updateHomeContent: async ({ client, admin, userId, args }) => {
        return respond(await updateHomeContent(client, admin, userId, args[0] as Row));
    },

    listDepartments: async ({ client, admin, userId, args }) => {
        return respond(await listDepartments(client));
    },

    listPlaces: async ({ client, admin, userId, args }) => {
        return respond(await listPlaces(client));
    },

    listInventoryTypes: async ({ client, admin, userId, args }) => {
        return respond(await listInventoryTypes(client));
    },

    getSettings: async ({ client, admin, userId, args }) => {
        return respond(await getSettings(client));
    },

    listAllowedEmailDomains: async ({ client, admin, userId, args }) => {
        return respond(await listAllowedEmailDomains(client, userId));
    },

    createAllowedEmailDomain: async ({ client, admin, userId, args }) => {
        return respond(
            await createAllowedEmailDomain(client, admin, userId, args[0] as Row, String(args[1])),
        );
    },

    deleteAllowedEmailDomain: async ({ client, admin, userId, args }) => {
        await deleteAllowedEmailDomain(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    getHomeContent: async ({ client, admin, userId, args }) => {
        return respond(await getHomeContent(client));
    },

    listBlocks: async ({ client, admin, userId, args }) => {
        return respond(await listBlocks(client));
    },

    listUsers: async ({ client, admin, userId, args }) => {
        return respond(await listUsers(client, userId));
    },

    listRosters: async ({ client, admin, userId, args }) => {
        return respond(await listRosters(client, admin, Number(args[0]) || 1));
    },

    createRoster: async ({ client, admin, userId, args }) => {
        return respond(await createRoster(client, admin, userId, args[0] as Row, String(args[1])));
    },

    updateRoster: async ({ client, admin, userId, args }) => {
        return respond(
            await updateRoster(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteRoster: async ({ client, admin, userId, args }) => {
        await deleteRoster(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    listInventoryRequests: async ({ client, admin, userId, args }) => {
        return respond(
            await listInventoryRequests(
                client,
                admin,
                Number(args[0]) || 1,
                (args[1] as Row) || {},
            ),
        );
    },

    getInventoryRequest: async ({ client, admin, userId, args }) => {
        return respond(await getInventoryRequest(client, admin, String(args[0])));
    },

    createInventoryRequest: async ({ client, admin, userId, args }) => {
        return respond(
            await createInventoryRequest(client, admin, userId, args[0] as Row, String(args[1])),
        );
    },

    updateInventoryRequest: async ({ client, admin, userId, args }) => {
        return respond(
            await updateInventoryRequest(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    updateInventoryRequestParticipants: async ({ client, admin, userId, args }) => {
        return respond(
            await updateInventoryRequestParticipants(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteInventoryRequest: async ({ client, admin, userId, args }) => {
        await deleteInventoryRequest(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    performInventoryRequestAction: async ({ client, admin, userId, args }) => {
        // args[3] (returnItems) is unused — it's unused in the source
        // app's own implementation too (see the comment above
        // performInventoryRequestAction).
        return respond(
            await performInventoryRequestAction(
                client,
                admin,
                userId,
                String(args[0]),
                String(args[1]),
                String(args[2] || ''),
                String(args[4]),
            ),
        );
    },

    listProgramRequests: async ({ client, admin, userId, args }) => {
        return respond(
            await listProgramRequests(client, admin, Number(args[0]) || 1, (args[1] as Row) || {}),
        );
    },

    getProgramRequest: async ({ client, admin, userId, args }) => {
        return respond(await getProgramRequest(client, admin, String(args[0])));
    },

    getAvailablePlaces: async ({ client, admin, userId, args }) => {
        return respond(
            await getAvailablePlaces(admin, String(args[0] || ''), (args[1] as Row[]) || []),
        );
    },

    getCalendarMonth: async ({ client, admin, userId, args }) => {
        return respond(await getCalendarMonth(admin, Number(args[0]), Number(args[1])));
    },

    createProgramRequest: async ({ client, admin, userId, args }) => {
        return respond(
            await createProgramRequest(client, admin, userId, args[0] as Row, String(args[1])),
        );
    },

    updateProgramRequest: async ({ client, admin, userId, args }) => {
        return respond(
            await updateProgramRequest(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    updateProgramRequestParticipants: async ({ client, admin, userId, args }) => {
        return respond(
            await updateProgramRequestParticipants(
                client,
                admin,
                userId,
                String(args[0]),
                args[1] as Row,
                String(args[2]),
            ),
        );
    },

    deleteProgramRequest: async ({ client, admin, userId, args }) => {
        await deleteProgramRequest(client, admin, userId, String(args[0]), String(args[1]));
        return respond(null);
    },

    performProgramRequestAction: async ({ client, admin, userId, args }) => {
        return respond(
            await performProgramRequestAction(
                client,
                admin,
                userId,
                String(args[0]),
                String(args[1]),
                String(args[2] || ''),
                String(args[3]),
            ),
        );
    },

    addComment: async ({ client, admin, userId, args }) => {
        return respond(
            await addComment(
                client,
                admin,
                userId,
                String(args[0]),
                String(args[1]),
                String(args[2]),
            ),
        );
    },

    uploadImage: async ({ client, admin, userId, args }) => {
        return respond(
            await uploadImage(
                admin,
                userId,
                String(args[0]),
                String(args[1]),
                String(args[2]),
                String(args[3] || ''),
            ),
        );
    },

    createImageUploadUrl: async ({ client, admin, userId, args }) => {
        return respond(await createImageUploadUrl(admin, userId, String(args[0]), String(args[1])));
    },

    getImageUrl: async ({ client, admin, userId, args }) => {
        return respond(await getImageUrl(admin, String(args[0])));
    },
};
