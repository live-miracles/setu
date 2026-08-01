import type { DemoState } from '@/domain/types';
import { apiHandler, jsonOk } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { demoState } from '@/demo/data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Named = { id: string; name: string };
type NamedMaybeArray = Named | Named[] | null;

interface InventoryItemRow {
    id: string;
    inventory_type_id: string;
    quantity: number;
    issued_quantity: number;
    returned_quantity: number;
    condition: 'good' | 'damaged' | 'missing' | null;
    inventory_types: NamedMaybeArray;
}

interface CommentRow {
    id: string;
    timestamp: string;
    message: string;
    author: Named | Named[] | null;
}

interface SessionRow {
    id: string;
    name: string;
    type: string;
    start_date_time: string;
    end_date_time: string;
}

export async function GET() {
    return apiHandler(async () => {
        const user = await requireUser();
        if (isDemoMode) return jsonOk(demoState);

        const admin = createSupabaseAdminClient();
        const [
            usersResult,
            rostersResult,
            inventoryTypesResult,
            inventoryRequestsResult,
            programRequestsResult,
            ticketsResult,
            linksResult,
            settingsResult,
        ] = await Promise.all([
            admin.from('users').select('id,name,role,phone,whatsapp,timezone,departments(name)').order('name'),
            admin
                .from('rosters')
                .select('id,name,start_date,end_date,start_time,end_time,user:users!user_id(id,name)')
                .order('start_date', { ascending: false })
                .limit(250),
            admin.from('inventory_types_with_availability').select('*').order('name'),
            admin
                .from('inventory_requests')
                .select(
                    '*,requester:users!user_id(id,name,departments(name)),inventory_items(*,inventory_types(name)),comments(id,timestamp,message,author:users!user_id(id,name))',
                )
                .order('display_id', { ascending: false })
                .limit(250),
            admin
                .from('program_requests')
                .select(
                    '*,requester:users!user_id(id,name,departments(name)),places(name),sessions(*),comments(id,timestamp,message,author:users!user_id(id,name))',
                )
                .order('display_id', { ascending: false })
                .limit(250),
            admin
                .from('tickets')
                .select('*,assignee:users!assignee_id(id,name)')
                .order('display_id', { ascending: false })
                .limit(250),
            admin.from('links').select('*').order('name'),
            admin
                .from('settings')
                .select('id,value')
                .in('id', ['support_message', 'guidelines', 'whatsapp_url', 'tutorial_url']),
        ]);

        for (const result of [
            usersResult,
            rostersResult,
            inventoryTypesResult,
            inventoryRequestsResult,
            programRequestsResult,
            ticketsResult,
            linksResult,
            settingsResult,
        ]) {
            if (result.error) throw result.error;
        }

        const settingsById = Object.fromEntries(
            (settingsResult.data ?? []).map((row) => [row.id, row.value]),
        );

        const state: DemoState = {
            currentUser: user,
            users: (usersResult.data ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                role: row.role,
                department: relatedName(row.departments) ?? 'Unassigned',
                timezone: row.timezone,
                phone: row.phone ?? undefined,
                whatsapp: row.whatsapp ?? undefined,
            })),
            rosters: (rostersResult.data ?? []).map((row) => {
                const assignee = relatedObject(row.user);
                return {
                    id: row.id,
                    name: row.name,
                    startDate: row.start_date,
                    endDate: row.end_date,
                    startTime: row.start_time,
                    endTime: row.end_time,
                    user: { id: assignee?.id ?? '', name: assignee?.name ?? 'Unknown' },
                };
            }),
            inventoryTypes: (inventoryTypesResult.data ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                description: row.description ?? undefined,
                requestable: row.requestable,
                imageDriveId: row.image_drive_id ?? undefined,
                totalQuantity: row.total_quantity,
                availableQuantity: row.available_quantity,
            })),
            inventoryRequests: (inventoryRequestsResult.data ?? []).map((row) => {
                const requester = relatedObject(row.requester);
                return {
                    id: row.id,
                    displayId: row.display_id,
                    name: row.name,
                    requester: {
                        id: requester?.id ?? '',
                        name: requester?.name ?? 'Unknown',
                        department:
                            relatedName(
                                requester && 'departments' in requester ? requester.departments : null,
                            ) ?? 'Unassigned',
                    },
                    startDate: row.start_date,
                    endDate: row.end_date,
                    status: row.status,
                    items: (row.inventory_items ?? []).map((item: InventoryItemRow) => ({
                        id: item.id,
                        inventoryTypeId: item.inventory_type_id,
                        name: relatedName(item.inventory_types) ?? 'Equipment',
                        quantity: item.quantity,
                        issuedQuantity: item.issued_quantity,
                        returnedQuantity: item.returned_quantity,
                        condition: item.condition ?? undefined,
                    })),
                    images: [row.image1_drive_id, row.image2_drive_id, row.image3_drive_id].filter(
                        (id): id is string => Boolean(id),
                    ),
                    comments: (row.comments ?? []).map((comment: CommentRow) => {
                        const author = relatedObject(comment.author);
                        return {
                            id: comment.id,
                            timestamp: comment.timestamp,
                            author: { id: author?.id ?? '', name: author?.name ?? 'Unknown' },
                            message: comment.message,
                        };
                    }),
                };
            }),
            programRequests: (programRequestsResult.data ?? []).map((row) => {
                const requester = relatedObject(row.requester);
                return {
                    id: row.id,
                    displayId: row.display_id,
                    name: row.name,
                    type: row.type,
                    requester: {
                        id: requester?.id ?? '',
                        name: requester?.name ?? 'Unknown',
                        department:
                            relatedName(
                                requester && 'departments' in requester ? requester.departments : null,
                            ) ?? 'Unassigned',
                    },
                    place: relatedName(row.places) ?? 'Unassigned',
                    status: row.status,
                    sessions: (row.sessions ?? []).map((session: SessionRow) => ({
                        id: session.id,
                        name: session.name,
                        type: session.type,
                        startDateTime: session.start_date_time,
                        endDateTime: session.end_date_time,
                    })),
                    comments: (row.comments ?? []).map((comment: CommentRow) => {
                        const author = relatedObject(comment.author);
                        return {
                            id: comment.id,
                            timestamp: comment.timestamp,
                            author: { id: author?.id ?? '', name: author?.name ?? 'Unknown' },
                            message: comment.message,
                        };
                    }),
                };
            }),
            tickets: (ticketsResult.data ?? []).map((row) => {
                const assignee = relatedObject(row.assignee);
                return {
                    id: row.id,
                    displayId: row.display_id,
                    title: row.title,
                    description: row.description,
                    status: row.status,
                    assignee: assignee ? { id: assignee.id, name: assignee.name } : undefined,
                };
            }),
            links: (linksResult.data ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                url: row.url,
            })),
            homeContent: {
                guidelines: settingsById.guidelines ?? '',
                whatsappUrl: settingsById.whatsapp_url ?? '',
                tutorialUrl: settingsById.tutorial_url ?? '',
                supportMessage: settingsById.support_message ?? '',
            },
        };
        return jsonOk(state);
    });
}

function relatedObject<T extends Named>(value: T | T[] | null): T | null {
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function relatedName(value: NamedMaybeArray | unknown) {
    if (!value || typeof value !== 'object') return null;
    const record = Array.isArray(value) ? value[0] : value;
    return record && typeof record === 'object' && 'name' in record && typeof record.name === 'string'
        ? record.name
        : null;
}
