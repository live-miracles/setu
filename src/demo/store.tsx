'use client';

import {
    createContext,
    type PropsWithChildren,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { demoState as initialDemoState } from './data';
import type {
    DemoState,
    InventoryRequest,
    InventoryRequestStatus,
    RosterShift,
    Ticket,
    TicketStatus,
} from '@/domain/types';
import { canTransitionRequest, canTransitionTicket } from '@/domain/workflows';
import { isDemoMode } from '@/lib/env';

interface DemoActions {
    hydrate: (state: DemoState) => void;
    addShift: (shift: Omit<RosterShift, 'id' | 'updatedAt'>) => Promise<void>;
    addRequest: (
        request: Omit<InventoryRequest, 'id' | 'createdAt' | 'updatedAt'>,
    ) => Promise<void>;
    transitionRequest: (id: string, status: InventoryRequestStatus, note?: string) => Promise<void>;
    addTicket: (
        ticket: Omit<Ticket, 'id' | 'comments' | 'createdAt' | 'updatedAt'>,
    ) => Promise<void>;
    addTicketComment: (id: string, message: string) => Promise<void>;
    transitionTicket: (id: string, status: TicketStatus, assigneeId?: string) => Promise<void>;
    markNotificationsRead: () => Promise<void>;
    enablePush: () => void;
    inviteProfile: (input: {
        email: string;
        name: string;
        role: 'admin' | 'member';
        timezone: string;
    }) => Promise<void>;
    updateUserAccess: (
        id: string,
        input: { role?: 'admin' | 'member'; status?: 'invited' | 'active' | 'disabled' },
    ) => Promise<void>;
    updateProfile: (
        input: Pick<ProfileUpdate, 'name' | 'phone' | 'whatsapp' | 'timezone'>,
    ) => Promise<void>;
}

type ProfileUpdate = DemoState['currentUser'];

const DemoContext = createContext<{ state: DemoState; actions: DemoActions } | undefined>(
    undefined,
);

export function DemoStoreProvider({ children }: PropsWithChildren) {
    const [state, setState] = useState<DemoState>(
        isDemoMode
            ? initialDemoState
            : {
                  currentUser: {
                      id: '',
                      name: 'Loading',
                      email: '',
                      role: 'member',
                      status: 'active',
                      department: '',
                      timezone: 'Asia/Kolkata',
                      notificationPreferences: { email: true, push: false },
                  },
                  profiles: [],
                  shifts: [],
                  inventory: [],
                  requests: [],
                  tickets: [],
                  notifications: [],
                  links: [],
                  homeContent: {
                      guidelines: '',
                      whatsappUrl: '',
                      tutorialUrl: '',
                      supportMessage: '',
                  },
              },
    );
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const actions = useMemo<DemoActions>(
        () => ({
            hydrate(nextState) {
                setState(nextState);
            },
            async addShift(shift) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/roster/shifts', {
                        method: 'POST',
                        headers: { 'Idempotency-Key': crypto.randomUUID() },
                        body: JSON.stringify({
                            startsAt: shift.startsAt,
                            endsAt: shift.endsAt,
                            period: shift.period,
                            locationName: shift.location,
                            assigneeIds: shift.assignees.map((person) => person.id),
                            notes: shift.notes,
                        }),
                    });
                }
                setState((current) => ({
                    ...current,
                    shifts: [
                        ...current.shifts,
                        {
                            ...shift,
                            id: crypto.randomUUID(),
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                }));
            },
            async addRequest(request) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/inventory-requests', {
                        method: 'POST',
                        headers: { 'Idempotency-Key': crypto.randomUUID() },
                        body: JSON.stringify({
                            title: request.title,
                            fromDate: request.fromDate,
                            toDate: request.toDate,
                            purpose: request.purpose,
                            items: request.items.map((item) => ({
                                inventoryItemId: item.inventoryItemId,
                                quantity: item.quantity,
                            })),
                        }),
                    });
                }
                setState((current) => ({
                    ...current,
                    requests: [
                        {
                            ...request,
                            id: `REQ-${1043 + current.requests.length}`,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                        ...current.requests,
                    ],
                }));
            },
            async transitionRequest(id, status, note) {
                const request = stateRef.current.requests.find((item) => item.id === id);
                if (!request) throw new Error('Inventory request not found.');
                if (!canTransitionRequest(request.status, status)) {
                    throw new Error(`Cannot move a request from ${request.status} to ${status}.`);
                }

                if (!isDemoMode) {
                    const action = requestActionForStatus(status);
                    const returns =
                        status === 'returned'
                            ? request.items
                                  .filter((item) => item.returnedQuantity < item.quantity)
                                  .map((item) => ({
                                      requestItemId: item.id,
                                      quantity: item.quantity - item.returnedQuantity,
                                      condition: parseReturnCondition(note),
                                      notes: note?.trim() || 'Returned by operations',
                                  }))
                            : [];
                    await apiRequest(
                        `/api/v1/inventory-requests/${request.recordId ?? request.id}/${action}`,
                        {
                            method: 'POST',
                            headers: { 'Idempotency-Key': crypto.randomUUID() },
                            body: JSON.stringify({ note: note ?? '', returns }),
                        },
                    );
                }
                setState((current) => ({
                    ...current,
                    requests: current.requests.map((request) => {
                        if (request.id !== id) return request;
                        if (!canTransitionRequest(request.status, status)) {
                            throw new Error(
                                `Cannot move a request from ${request.status} to ${status}.`,
                            );
                        }
                        return {
                            ...request,
                            status,
                            adminNote: note ?? request.adminNote,
                            updatedAt: new Date().toISOString(),
                            isOverdue: status === 'issued' ? request.isOverdue : false,
                        };
                    }),
                }));
            },
            async addTicket(ticket) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/tickets', {
                        method: 'POST',
                        headers: { 'Idempotency-Key': crypto.randomUUID() },
                        body: JSON.stringify({
                            title: ticket.title,
                            description: ticket.description,
                            locationName: ticket.location,
                            priority: ticket.priority,
                        }),
                    });
                }
                setState((current) => ({
                    ...current,
                    tickets: [
                        {
                            ...ticket,
                            id: `TKT-${222 + current.tickets.length}`,
                            comments: [],
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                        ...current.tickets,
                    ],
                }));
            },
            async addTicketComment(id, commentMessage) {
                const ticket = stateRef.current.tickets.find((item) => item.id === id);
                if (!ticket) throw new Error('Ticket not found.');
                if (!isDemoMode) {
                    await apiRequest(`/api/v1/tickets/${ticket.recordId ?? ticket.id}/comments`, {
                        method: 'POST',
                        headers: { 'Idempotency-Key': crypto.randomUUID() },
                        body: JSON.stringify({ message: commentMessage }),
                    });
                }
                setState((current) => ({
                    ...current,
                    tickets: current.tickets.map((item) =>
                        item.id === id
                            ? {
                                  ...item,
                                  updatedAt: new Date().toISOString(),
                                  comments: [
                                      ...item.comments,
                                      {
                                          id: crypto.randomUUID(),
                                          author: {
                                              id: current.currentUser.id,
                                              name: current.currentUser.name,
                                          },
                                          message: commentMessage,
                                          createdAt: new Date().toISOString(),
                                      },
                                  ],
                              }
                            : item,
                    ),
                }));
            },
            async transitionTicket(id, status, assigneeId) {
                const ticket = stateRef.current.tickets.find((item) => item.id === id);
                if (!ticket) throw new Error('Ticket not found.');
                if (!canTransitionTicket(ticket.status, status)) {
                    throw new Error(`Cannot move a ticket from ${ticket.status} to ${status}.`);
                }
                if (!isDemoMode) {
                    const action =
                        status === 'closed'
                            ? 'close'
                            : ticket.status === 'closed'
                              ? 'reopen'
                              : 'assign';
                    await apiRequest(`/api/v1/tickets/${ticket.recordId ?? ticket.id}/${action}`, {
                        method: 'POST',
                        headers: { 'Idempotency-Key': crypto.randomUUID() },
                        body: JSON.stringify({ assigneeId }),
                    });
                }
                setState((current) => ({
                    ...current,
                    tickets: current.tickets.map((ticket) => {
                        if (ticket.id !== id) return ticket;
                        if (!canTransitionTicket(ticket.status, status)) {
                            throw new Error(
                                `Cannot move a ticket from ${ticket.status} to ${status}.`,
                            );
                        }
                        const assignee = assigneeId
                            ? current.profiles.find((profile) => profile.id === assigneeId)
                            : undefined;
                        return {
                            ...ticket,
                            status,
                            assignee: assignee
                                ? { id: assignee.id, name: assignee.name }
                                : ticket.assignee,
                            updatedAt: new Date().toISOString(),
                        };
                    }),
                }));
            },
            async markNotificationsRead() {
                if (!isDemoMode) {
                    await Promise.all(
                        stateRef.current.notifications
                            .filter((notification) => !notification.read)
                            .map((notification) =>
                                apiRequest(`/api/v1/notifications/${notification.id}/read`, {
                                    method: 'POST',
                                }),
                            ),
                    );
                }
                setState((current) => ({
                    ...current,
                    notifications: current.notifications.map((notification) => ({
                        ...notification,
                        read: true,
                    })),
                }));
            },
            enablePush() {
                setState((current) => ({
                    ...current,
                    currentUser: {
                        ...current.currentUser,
                        notificationPreferences: {
                            ...current.currentUser.notificationPreferences,
                            push: true,
                        },
                    },
                }));
            },
            async inviteProfile(input) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/users', {
                        method: 'POST',
                        headers: { 'Idempotency-Key': crypto.randomUUID() },
                        body: JSON.stringify(input),
                    });
                }
                setState((current) => ({
                    ...current,
                    profiles: [
                        ...current.profiles,
                        {
                            id: crypto.randomUUID(),
                            ...input,
                            email: input.email.toLowerCase(),
                            status: 'invited',
                            department: 'Unassigned',
                            notificationPreferences: { email: true, push: false },
                        },
                    ],
                }));
            },
            async updateUserAccess(id, input) {
                if (!isDemoMode) {
                    await apiRequest(`/api/v1/users/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(input),
                    });
                }
                setState((current) => ({
                    ...current,
                    profiles: current.profiles.map((profile) =>
                        profile.id === id ? { ...profile, ...input } : profile,
                    ),
                }));
            },
            async updateProfile(input) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/users/me', {
                        method: 'PATCH',
                        body: JSON.stringify(input),
                    });
                }
                setState((current) => ({
                    ...current,
                    currentUser: { ...current.currentUser, ...input },
                    profiles: current.profiles.map((profile) =>
                        profile.id === current.currentUser.id ? { ...profile, ...input } : profile,
                    ),
                }));
            },
        }),
        [],
    );

    return <DemoContext.Provider value={{ state, actions }}>{children}</DemoContext.Provider>;
}

async function apiRequest(path: string, init: RequestInit) {
    if (!navigator.onLine) {
        throw new Error('You are offline. Reconnect before making changes.');
    }
    const response = await fetch(path, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...init.headers,
        },
    });
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? 'The operation could not be saved.');
    }
    return response;
}

function requestActionForStatus(status: InventoryRequestStatus) {
    const actions: Partial<Record<InventoryRequestStatus, string>> = {
        submitted: 'submit',
        approved: 'approve',
        rejected: 'reject',
        issued: 'issue',
        returned: 'return',
        cancelled: 'cancel',
        closed: 'close',
    };
    const action = actions[status];
    if (!action) throw new Error(`No command exists for status ${status}.`);
    return action;
}

function parseReturnCondition(note?: string) {
    const condition = note?.split(':')[0];
    return condition === 'damaged' || condition === 'missing' ? condition : 'good';
}

export function useDemoStore() {
    const store = useContext(DemoContext);
    if (!store) {
        throw new Error('useDemoStore must be used inside DemoStoreProvider.');
    }
    return store;
}
