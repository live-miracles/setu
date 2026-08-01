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
    ProgramRequest,
    ProgramRequestStatus,
    ReturnCondition,
    Roster,
    Ticket,
    TicketStatus,
    User,
    UserRole,
} from '@/domain/types';
import {
    canTransitionProgramRequest,
    canTransitionRequest,
    canTransitionTicket,
} from '@/domain/workflows';
import { isDemoMode } from '@/lib/env';

interface DemoActions {
    hydrate: (state: DemoState) => void;
    addRoster: (roster: Omit<Roster, 'id'>) => Promise<void>;
    addInventoryRequest: (
        request: Omit<InventoryRequest, 'id' | 'displayId' | 'status' | 'comments'>,
    ) => Promise<void>;
    transitionInventoryRequest: (
        id: string,
        status: InventoryRequestStatus,
        options?: {
            note?: string;
            returns?: { itemId: string; condition: ReturnCondition }[];
            images?: string[];
        },
    ) => Promise<void>;
    addInventoryComment: (id: string, message: string) => Promise<void>;
    addProgramRequest: (
        request: Omit<ProgramRequest, 'id' | 'displayId' | 'status' | 'comments'> & {
            placeId: string;
        },
    ) => Promise<void>;
    transitionProgramRequest: (
        id: string,
        status: ProgramRequestStatus,
        note?: string,
    ) => Promise<void>;
    addProgramComment: (id: string, message: string) => Promise<void>;
    addTicket: (ticket: Pick<Ticket, 'title' | 'description'>) => Promise<void>;
    transitionTicket: (id: string, status: TicketStatus, assigneeId?: string) => Promise<void>;
    updateUserAccess: (
        id: string,
        input: { role?: UserRole; departmentId?: string; timezone?: string },
    ) => Promise<void>;
    updateProfile: (input: Pick<User, 'name' | 'phone' | 'whatsapp' | 'timezone'>) => Promise<void>;
}

const DemoContext = createContext<{ state: DemoState; actions: DemoActions } | undefined>(
    undefined,
);

const EMPTY_STATE: DemoState = {
    currentUser: {
        id: '',
        name: 'Loading',
        role: 'member',
        department: '',
        timezone: 'Asia/Kolkata',
    },
    users: [],
    rosters: [],
    inventoryTypes: [],
    inventoryRequests: [],
    programRequests: [],
    tickets: [],
    links: [],
    homeContent: { guidelines: '', whatsappUrl: '', tutorialUrl: '', supportMessage: '' },
};

export function DemoStoreProvider({ children }: PropsWithChildren) {
    const [state, setState] = useState<DemoState>(isDemoMode ? initialDemoState : EMPTY_STATE);
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const actions = useMemo<DemoActions>(
        () => ({
            hydrate(nextState) {
                setState(nextState);
            },
            async addRoster(roster) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/rosters', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: roster.name,
                            startDate: roster.startDate,
                            endDate: roster.endDate,
                            startTime: roster.startTime,
                            endTime: roster.endTime,
                            userId: roster.user.id,
                        }),
                    });
                }
                setState((current) => ({
                    ...current,
                    rosters: [...current.rosters, { ...roster, id: crypto.randomUUID() }],
                }));
            },
            async addInventoryRequest(request) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/inventory-requests', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: request.name,
                            startDate: request.startDate,
                            endDate: request.endDate,
                            items: request.items.map((item) => ({
                                inventoryTypeId: item.inventoryTypeId,
                                quantity: item.quantity,
                            })),
                            images: request.images,
                        }),
                    });
                }
                setState((current) => ({
                    ...current,
                    inventoryRequests: [
                        {
                            ...request,
                            id: crypto.randomUUID(),
                            displayId: 1043 + current.inventoryRequests.length,
                            status: 'submitted',
                            comments: [],
                        },
                        ...current.inventoryRequests,
                    ],
                }));
            },
            async transitionInventoryRequest(id, status, options) {
                const request = stateRef.current.inventoryRequests.find((item) => item.id === id);
                if (!request) throw new Error('Inventory request not found.');
                if (!canTransitionRequest(request.status, status)) {
                    throw new Error(`Cannot move a request from ${request.status} to ${status}.`);
                }
                if (!isDemoMode) {
                    const action = inventoryRequestActionForStatus(status);
                    await apiRequest(`/api/v1/inventory-requests/${id}/${action}`, {
                        method: 'POST',
                        body: JSON.stringify({
                            note: options?.note ?? '',
                            returns: options?.returns ?? [],
                            images: options?.images,
                        }),
                    });
                }
                setState((current) => ({
                    ...current,
                    inventoryRequests: current.inventoryRequests.map((item) => {
                        if (item.id !== id) return item;
                        const returnsById = new Map(
                            (options?.returns ?? []).map((entry) => [entry.itemId, entry.condition]),
                        );
                        return {
                            ...item,
                            status,
                            images: options?.images ?? item.images,
                            items: item.items.map((line) => {
                                if (status === 'issued') {
                                    return { ...line, issuedQuantity: line.quantity };
                                }
                                const condition = returnsById.get(line.id);
                                return condition
                                    ? { ...line, returnedQuantity: line.issuedQuantity, condition }
                                    : line;
                            }),
                        };
                    }),
                }));
            },
            async addInventoryComment(id, message) {
                if (!isDemoMode) {
                    await apiRequest(`/api/v1/inventory-requests/${id}/comments`, {
                        method: 'POST',
                        body: JSON.stringify({ message }),
                    });
                }
                setState((current) => ({
                    ...current,
                    inventoryRequests: current.inventoryRequests.map((item) =>
                        item.id === id
                            ? {
                                  ...item,
                                  comments: [
                                      ...item.comments,
                                      {
                                          id: crypto.randomUUID(),
                                          timestamp: new Date().toISOString(),
                                          author: {
                                              id: current.currentUser.id,
                                              name: current.currentUser.name,
                                          },
                                          message,
                                      },
                                  ],
                              }
                            : item,
                    ),
                }));
            },
            async addProgramRequest(request) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/program-requests', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: request.name,
                            type: request.type,
                            placeId: request.placeId,
                            sessions: request.sessions.map((session) => ({
                                name: session.name,
                                type: session.type,
                                startDateTime: session.startDateTime,
                                endDateTime: session.endDateTime,
                            })),
                        }),
                    });
                }
                setState((current) => ({
                    ...current,
                    programRequests: [
                        {
                            ...request,
                            id: crypto.randomUUID(),
                            displayId: 1 + current.programRequests.length,
                            status: 'submitted',
                            comments: [],
                            sessions: request.sessions.map((session) => ({
                                ...session,
                                id: crypto.randomUUID(),
                            })),
                        },
                        ...current.programRequests,
                    ],
                }));
            },
            async transitionProgramRequest(id, status, note) {
                const request = stateRef.current.programRequests.find((item) => item.id === id);
                if (!request) throw new Error('Program request not found.');
                if (!canTransitionProgramRequest(request.status, status)) {
                    throw new Error(`Cannot move a request from ${request.status} to ${status}.`);
                }
                if (!isDemoMode) {
                    const action = programRequestActionForStatus(status);
                    await apiRequest(`/api/v1/program-requests/${id}/${action}`, {
                        method: 'POST',
                        body: JSON.stringify({ note: note ?? '' }),
                    });
                }
                setState((current) => ({
                    ...current,
                    programRequests: current.programRequests.map((item) =>
                        item.id === id ? { ...item, status } : item,
                    ),
                }));
            },
            async addProgramComment(id, message) {
                if (!isDemoMode) {
                    await apiRequest(`/api/v1/program-requests/${id}/comments`, {
                        method: 'POST',
                        body: JSON.stringify({ message }),
                    });
                }
                setState((current) => ({
                    ...current,
                    programRequests: current.programRequests.map((item) =>
                        item.id === id
                            ? {
                                  ...item,
                                  comments: [
                                      ...item.comments,
                                      {
                                          id: crypto.randomUUID(),
                                          timestamp: new Date().toISOString(),
                                          author: {
                                              id: current.currentUser.id,
                                              name: current.currentUser.name,
                                          },
                                          message,
                                      },
                                  ],
                              }
                            : item,
                    ),
                }));
            },
            async addTicket(ticket) {
                if (!isDemoMode) {
                    await apiRequest('/api/v1/tickets', {
                        method: 'POST',
                        body: JSON.stringify(ticket),
                    });
                }
                setState((current) => ({
                    ...current,
                    tickets: [
                        {
                            ...ticket,
                            id: crypto.randomUUID(),
                            displayId: 222 + current.tickets.length,
                            status: 'unassigned',
                        },
                        ...current.tickets,
                    ],
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
                    await apiRequest(`/api/v1/tickets/${id}/${action}`, {
                        method: 'POST',
                        body: JSON.stringify({ assigneeId }),
                    });
                }
                setState((current) => ({
                    ...current,
                    tickets: current.tickets.map((ticket) => {
                        if (ticket.id !== id) return ticket;
                        const assignee = assigneeId
                            ? current.users.find((user) => user.id === assigneeId)
                            : undefined;
                        return {
                            ...ticket,
                            status,
                            assignee: assignee
                                ? { id: assignee.id, name: assignee.name }
                                : ticket.assignee,
                        };
                    }),
                }));
            },
            async updateUserAccess(id, input) {
                if (!isDemoMode) {
                    await apiRequest(`/api/v1/users/${encodeURIComponent(id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify(input),
                    });
                }
                setState((current) => ({
                    ...current,
                    users: current.users.map((user) =>
                        user.id === id ? { ...user, role: input.role ?? user.role } : user,
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
                    users: current.users.map((user) =>
                        user.id === current.currentUser.id ? { ...user, ...input } : user,
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

function inventoryRequestActionForStatus(status: InventoryRequestStatus) {
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

function programRequestActionForStatus(status: ProgramRequestStatus) {
    const actions: Partial<Record<ProgramRequestStatus, string>> = {
        submitted: 'submit',
        approved: 'approve',
        rejected: 'reject',
        cancelled: 'cancel',
        closed: 'close',
    };
    const action = actions[status];
    if (!action) throw new Error(`No command exists for status ${status}.`);
    return action;
}

export function useDemoStore() {
    const store = useContext(DemoContext);
    if (!store) {
        throw new Error('useDemoStore must be used inside DemoStoreProvider.');
    }
    return store;
}
