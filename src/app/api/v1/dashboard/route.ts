import { addDays, formatISO } from 'date-fns';
import type { DemoState, Profile } from '@/domain/types';
import { apiHandler, jsonOk } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { demoState } from '@/demo/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Named = { id: string; name: string };
type NamedMaybeArray = Named | Named[] | null;

export async function GET() {
    return apiHandler(async () => {
        const user = await requireUser();
        if (isDemoMode) return jsonOk(demoState);

        const supabase = await createServerSupabaseClient();
        const now = new Date();
        const through = addDays(now, 45);
        const [
            profilesResult,
            shiftsResult,
            inventoryResult,
            requestsResult,
            ticketsResult,
            notificationsResult,
            linksResult,
            homeContentResult,
        ] = await Promise.all([
            supabase
                .from('profiles')
                .select(
                    'id,name,email,role,status,phone,whatsapp,timezone,avatar_path,notification_email,notification_push,departments(name)',
                )
                .order('name'),
            supabase
                .from('roster_shifts')
                .select(
                    'id,starts_at,ends_at,period,location_name,notes,updated_at,roster_assignments(profile_id,profiles(id,name,avatar_path))',
                )
                .lte('starts_at', formatISO(through))
                .order('starts_at')
                .limit(250),
            supabase
                .from('inventory_items')
                .select(
                    'id,name,serial_number,total_quantity,available_quantity,image_path,updated_at,equipment_types(name),locations(name)',
                )
                .order('name')
                .limit(500),
            supabase
                .from('inventory_requests')
                .select(
                    'id,display_id,title,from_date,to_date,purpose,status,admin_note,created_at,updated_at,profiles!requester_id(id,name,departments(name)),inventory_request_items(id,inventory_item_id,quantity,returned_quantity,inventory_items(name))',
                )
                .order('updated_at', { ascending: false })
                .limit(250),
            supabase
                .from('tickets')
                .select(
                    'id,display_id,title,description,location_name,status,priority,created_at,updated_at,reporter:profiles!reporter_id(id,name),assignee:profiles!assignee_id(id,name),ticket_comments(id,message,created_at,author:profiles!author_id(id,name))',
                )
                .order('updated_at', { ascending: false })
                .limit(250),
            supabase
                .from('notifications')
                .select('id,title,message,href,read_at,created_at')
                .eq('recipient_id', user.id)
                .order('created_at', { ascending: false })
                .limit(100),
            supabase
                .from('links')
                .select('id,name,url,display_order')
                .eq('enabled', true)
                .order('display_order'),
            supabase.from('home_content').select('*').single(),
        ]);

        for (const result of [
            profilesResult,
            shiftsResult,
            inventoryResult,
            requestsResult,
            ticketsResult,
            notificationsResult,
            linksResult,
            homeContentResult,
        ]) {
            if (result.error) throw result.error;
        }

        const profiles: Profile[] = (profilesResult.data ?? []).map((profile) => ({
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            status: profile.status,
            phone: profile.phone ?? undefined,
            whatsapp: profile.whatsapp ?? undefined,
            timezone: profile.timezone,
            avatarUrl: profile.avatar_path ?? undefined,
            department: relatedName(profile.departments) ?? 'Unassigned',
            notificationPreferences: {
                email: profile.notification_email,
                push: profile.notification_push,
            },
        }));

        const state: DemoState = {
            currentUser: user,
            profiles,
            shifts: (shiftsResult.data ?? []).map((shift) => ({
                id: shift.id,
                startsAt: shift.starts_at,
                endsAt: shift.ends_at,
                period: shift.period,
                location: shift.location_name,
                notes: shift.notes ?? undefined,
                updatedAt: shift.updated_at,
                assignees: (shift.roster_assignments ?? []).flatMap((assignment) => {
                    const person = relatedObject(assignment.profiles);
                    return person
                        ? [
                              {
                                  id: person.id,
                                  name: person.name,
                                  avatarUrl:
                                      'avatar_path' in person &&
                                      typeof person.avatar_path === 'string'
                                          ? person.avatar_path
                                          : undefined,
                              },
                          ]
                        : [];
                }),
            })),
            inventory: (inventoryResult.data ?? []).map((item) => ({
                id: item.id,
                name: item.name,
                type: relatedName(item.equipment_types) ?? 'Equipment',
                location: relatedName(item.locations) ?? 'Unassigned',
                available: item.available_quantity,
                total: item.total_quantity,
                serialNumber: item.serial_number ?? undefined,
                imageUrl: item.image_path ?? undefined,
                updatedAt: item.updated_at,
            })),
            requests: (requestsResult.data ?? []).map((inventoryRequest) => {
                const requester = relatedObject(inventoryRequest.profiles);
                return {
                    id: `REQ-${inventoryRequest.display_id}`,
                    recordId: inventoryRequest.id,
                    title: inventoryRequest.title,
                    requester: {
                        id: requester?.id ?? '',
                        name: requester?.name ?? 'Unknown',
                        department:
                            relatedName(
                                requester && 'departments' in requester
                                    ? requester.departments
                                    : null,
                            ) ?? 'Unassigned',
                    },
                    fromDate: inventoryRequest.from_date,
                    toDate: inventoryRequest.to_date,
                    purpose: inventoryRequest.purpose,
                    status: inventoryRequest.status,
                    adminNote: inventoryRequest.admin_note ?? undefined,
                    createdAt: inventoryRequest.created_at,
                    updatedAt: inventoryRequest.updated_at,
                    isOverdue:
                        inventoryRequest.status === 'issued' &&
                        inventoryRequest.to_date < formatISO(now, { representation: 'date' }),
                    items: (inventoryRequest.inventory_request_items ?? []).map((item) => ({
                        id: item.id,
                        inventoryItemId: item.inventory_item_id,
                        name: relatedName(item.inventory_items) ?? 'Equipment',
                        quantity: item.quantity,
                        returnedQuantity: item.returned_quantity,
                    })),
                };
            }),
            tickets: (ticketsResult.data ?? []).map((ticket) => {
                const reporter = relatedObject(ticket.reporter);
                const assignee = relatedObject(ticket.assignee);
                return {
                    id: `TKT-${ticket.display_id}`,
                    recordId: ticket.id,
                    title: ticket.title,
                    description: ticket.description,
                    location: ticket.location_name,
                    status: ticket.status,
                    priority: ticket.priority,
                    reporter: {
                        id: reporter?.id ?? '',
                        name: reporter?.name ?? 'Unknown',
                    },
                    assignee: assignee ? { id: assignee.id, name: assignee.name } : undefined,
                    comments: (ticket.ticket_comments ?? []).map((comment) => {
                        const author = relatedObject(comment.author);
                        return {
                            id: comment.id,
                            author: {
                                id: author?.id ?? '',
                                name: author?.name ?? 'Unknown',
                            },
                            message: comment.message,
                            createdAt: comment.created_at,
                        };
                    }),
                    createdAt: ticket.created_at,
                    updatedAt: ticket.updated_at,
                };
            }),
            notifications: (notificationsResult.data ?? []).map((notification) => ({
                id: notification.id,
                title: notification.title,
                message: notification.message,
                href: notification.href,
                read: Boolean(notification.read_at),
                createdAt: notification.created_at,
            })),
            links: (linksResult.data ?? []).map((link) => ({
                id: link.id,
                name: link.name,
                url: link.url,
                order: link.display_order,
            })),
            homeContent: {
                guidelines: homeContentResult.data?.guidelines ?? '',
                whatsappUrl: homeContentResult.data?.whatsapp_url ?? '',
                tutorialUrl: homeContentResult.data?.tutorial_url ?? '',
                supportMessage: homeContentResult.data?.support_message ?? '',
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
    return record &&
        typeof record === 'object' &&
        'name' in record &&
        typeof record.name === 'string'
        ? record.name
        : null;
}
