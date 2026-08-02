// Local-dev-only stand-in for the Apps Script backend. Excluded from the
// production build (see build-tools/build.mjs). Rather than hand-writing one
// stub per backend function, this uses a generic Proxy so 02-api.ts's call
// sites are identical whether they end up talking to `google.script.run` or
// to this mock.

function mockNowIso(): string {
    return new Date().toISOString();
}

function mockUuid(): string {
    return 'mock-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function mockParseParticipants(raw: string): string[] {
    const seen = new Set<string>();
    (raw || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0)
        .forEach((email) => seen.add(email));
    return Array.from(seen);
}

const mockData = {
    currentUserId: 'admin@example.com',
    users: [
        {
            Email: 'admin@example.com',
            Name: 'Alex Admin',
            Role: 'admin' as UserRole,
            DepartmentId: 'dep-1',
            Timezone: 'Asia/Kolkata',
            Phone: '+91 90000 00001',
            Whatsapp: '',
        },
        {
            Email: 'sam@example.com',
            Name: 'Sam Member',
            Role: 'member' as UserRole,
            DepartmentId: 'dep-1',
            Timezone: 'Asia/Kolkata',
            Phone: '+91 90000 00002',
            Whatsapp: '',
        },
    ] as User[],
    departments: [{ Id: 'dep-1', Name: 'Production', ShortName: 'PROD' }] as Department[],
    places: [
        { Id: 'place-1', Name: 'Studio A' },
        { Id: 'place-2', Name: 'Studio B' },
    ] as Place[],
    inventoryTypes: [
        {
            Id: 'inv-1',
            Name: 'Camera',
            Description: 'Sony A7S III',
            Requestable: true,
            ImageId: '',
            TotalQuantity: 3,
        },
        {
            Id: 'inv-2',
            Name: 'Microphone',
            Description: 'Shure SM7B',
            Requestable: true,
            ImageId: '',
            TotalQuantity: 5,
        },
    ] as InventoryType[],
    inventoryRequests: [
        {
            Id: 'req-1',
            DisplayId: 1,
            Name: 'Weekend shoot',
            UserId: 'sam@example.com',
            StartDate: new Date().toISOString().slice(0, 10),
            EndDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
            Status: 'submitted' as InventoryRequestStatus,
            Image1Id: '',
            Image2Id: '',
            Image3Id: '',
            Participants: '',
        },
    ] as InventoryRequest[],
    inventoryItems: [
        {
            Id: 'reqitem-1',
            RequestId: 'req-1',
            InventoryTypeId: 'inv-1',
            Quantity: 1,
            Condition: '' as ReturnCondition | '',
        },
    ] as InventoryItem[],
    programRequests: [] as ProgramRequest[],
    sessions: [] as ProgramSession[],
    rosters: [
        {
            Id: 'roster-1',
            Name: 'Morning',
            StartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            EndDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            StartTime: '09:00',
            EndTime: '13:00',
            UserId: 'sam@example.com',
        },
    ] as Roster[],
    tickets: [
        {
            Id: 'ticket-1',
            DisplayId: 1,
            Title: 'Projector flickering',
            Description: 'Studio A projector flickers after 30 minutes.',
            Status: 'unassigned' as TicketStatus,
            AssigneeId: '',
        },
    ] as Ticket[],
    comments: [
        {
            Id: 'comment-1',
            Timestamp: mockNowIso(),
            ProgramRequestId: '',
            InventoryRequestId: 'req-1',
            UserId: 'sam@example.com',
            Message: 'Sam Member submitted this request.',
        },
    ] as CommentRecord[],
    links: [
        {
            Id: 'link-1',
            Name: 'Team wiki',
            Url: 'https://example.com/wiki',
            Enabled: true,
        },
    ] as Link[],
    homeContent: {
        SupportMessage: 'Reach out on WhatsApp for urgent issues.',
        Guidelines: 'Please return equipment within 24 hours of your shoot ending.',
        WhatsappUrl: 'https://wa.me/10000000000',
        TutorialUrl: '',
    } as HomeContent,
    nextDisplayId: { inventory_request: 2, program_request: 1, ticket: 2 },
};

function mockCurrentUser(): User {
    return mockData.users.find((u) => u.Email === mockData.currentUserId)!;
}

function mockToUserDTO(user: User): UserDTO {
    const department = mockData.departments.find((d) => d.Id === user.DepartmentId);
    return Object.assign({}, user, { departmentName: department ? department.Name : '' });
}

function mockBuildRosterDTO(roster: Roster): RosterDTO {
    const user = mockData.users.find((u) => u.Email === roster.UserId);
    return Object.assign({}, roster, { userName: user ? user.Name : '' });
}

function mockComputeDeductionsByType(): Record<string, number> {
    const deductions: Record<string, number> = {};
    mockData.inventoryItems.forEach((item) => {
        const request = mockData.inventoryRequests.find((r) => r.Id === item.RequestId);
        if (!request || request.Status !== 'issued') return;
        deductions[item.InventoryTypeId] = (deductions[item.InventoryTypeId] || 0) + item.Quantity;
    });
    return deductions;
}

function mockBuildInventoryTypeDTOs(): InventoryTypeDTO[] {
    const deductions = mockComputeDeductionsByType();
    return mockData.inventoryTypes.map((t) =>
        Object.assign({}, t, { availableQuantity: t.TotalQuantity - (deductions[t.Id] || 0) }),
    );
}

function mockBuildCommentDTO(comment: CommentRecord): CommentDTO {
    const user = mockData.users.find((u) => u.Email === comment.UserId);
    return Object.assign({}, comment, { userName: user ? user.Name : '' });
}

function mockCommentsForRequest(requestId: string): CommentDTO[] {
    return mockData.comments
        .filter((c) => c.InventoryRequestId === requestId || c.ProgramRequestId === requestId)
        .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp))
        .map(mockBuildCommentDTO);
}

function mockInsertActionComment(
    kind: 'inventory' | 'program',
    requestId: string,
    actorId: string,
    message: string,
): CommentRecord {
    const created: CommentRecord = {
        Id: mockUuid(),
        Timestamp: mockNowIso(),
        InventoryRequestId: kind === 'inventory' ? requestId : '',
        ProgramRequestId: kind === 'program' ? requestId : '',
        UserId: actorId,
        Message: message,
    };
    mockData.comments.push(created);
    return created;
}

function mockBuildInventoryRequestDTO(request: InventoryRequest): InventoryRequestDTO {
    const requester = mockData.users.find((u) => u.Email === request.UserId);
    const items = mockData.inventoryItems
        .filter((i) => i.RequestId === request.Id)
        .map((i) => {
            const type = mockData.inventoryTypes.find((t) => t.Id === i.InventoryTypeId);
            return Object.assign({}, i, { itemName: type ? type.Name : '' });
        });
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        participants: mockParseParticipants(request.Participants),
        items,
        comments: mockCommentsForRequest(request.Id),
    });
}

function mockBuildProgramRequestDTO(request: ProgramRequest): ProgramRequestDTO {
    const requester = mockData.users.find((u) => u.Email === request.UserId);
    const place = mockData.places.find((p) => p.Id === request.PlaceId);
    const sessions = mockData.sessions
        .filter((s) => s.RequestId === request.Id)
        .sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime));
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        placeName: place ? place.Name : '',
        participants: mockParseParticipants(request.Participants),
        sessions,
        comments: mockCommentsForRequest(request.Id),
    });
}

function mockBuildTicketDTO(ticket: Ticket): TicketDTO {
    const assignee = mockData.users.find((u) => u.Email === ticket.AssigneeId);
    return Object.assign({}, ticket, {
        assigneeName: assignee ? assignee.Name : '',
    });
}

function mockBuildDashboard(): DashboardPayload {
    return {
        me: mockToUserDTO(mockCurrentUser()),
        departments: mockData.departments,
        places: mockData.places,
        inventoryTypes: mockBuildInventoryTypeDTOs(),
        upcomingRosters: mockData.rosters.map(mockBuildRosterDTO),
        inventoryRequests: mockData.inventoryRequests.map(mockBuildInventoryRequestDTO),
        programRequests: mockData.programRequests.map(mockBuildProgramRequestDTO),
        tickets: mockData.tickets.map(mockBuildTicketDTO),
        links: mockData.links.filter((l) => l.Enabled),
        homeContent: mockData.homeContent,
        failedEmailCount: 0,
    };
}

const mockHandlers: Record<string, (...args: any[]) => any> = {
    whoAmI: () => mockToUserDTO(mockCurrentUser()),
    getDashboard: () => mockBuildDashboard(),

    listUsers: () => mockData.users.map(mockToUserDTO),
    updateUser: (userId: string, patch: UpdateUserInput) => {
        const user = mockData.users.find((u) => u.Email === userId)!;
        if (patch.role !== undefined) user.Role = patch.role;
        if (patch.departmentId !== undefined) user.DepartmentId = patch.departmentId;
        if (patch.timezone !== undefined) user.Timezone = patch.timezone;
        return mockToUserDTO(user);
    },
    updateOwnProfile: (patch: UpdateOwnProfileInput) => {
        const user = mockCurrentUser();
        if (patch.name !== undefined) user.Name = patch.name;
        if (patch.departmentId !== undefined) user.DepartmentId = patch.departmentId;
        if (patch.phone !== undefined) user.Phone = patch.phone;
        if (patch.whatsapp !== undefined) user.Whatsapp = patch.whatsapp;
        if (patch.timezone !== undefined) user.Timezone = patch.timezone;
        return mockToUserDTO(user);
    },

    listDepartments: () => mockData.departments,
    createDepartment: (input: CreateDepartmentInput) => {
        const created: Department = {
            Id: mockUuid(),
            Name: input.name,
            ShortName: input.shortName || '',
        };
        mockData.departments.push(created);
        return created;
    },

    listPlaces: () => mockData.places,
    createPlace: (input: CreatePlaceInput) => {
        const created: Place = { Id: mockUuid(), Name: input.name };
        mockData.places.push(created);
        return created;
    },

    listLinks: () => [...mockData.links].sort((a, b) => a.Name.localeCompare(b.Name)),
    createLink: (input: CreateLinkInput) => {
        const created: Link = {
            Id: mockUuid(),
            Name: input.name,
            Url: input.url,
            Enabled: input.enabled !== false,
        };
        mockData.links.push(created);
        return created;
    },

    getHomeContent: () => mockData.homeContent,
    updateHomeContent: (input: UpdateHomeContentInput) => {
        mockData.homeContent = {
            SupportMessage: input.supportMessage || '',
            Guidelines: input.guidelines || '',
            WhatsappUrl: input.whatsappUrl || '',
            TutorialUrl: input.tutorialUrl || '',
        };
        return mockData.homeContent;
    },

    listRosters: (page: number) => {
        const items = mockData.rosters.map(mockBuildRosterDTO);
        return { items, page: page || 1, pageSize: 20, totalCount: items.length };
    },
    createRoster: (input: CreateRosterInput) => {
        const created: Roster = {
            Id: mockUuid(),
            StartDate: input.startDate,
            EndDate: input.endDate,
            StartTime: input.startTime || '',
            EndTime: input.endTime || '',
            Name: input.name,
            UserId: input.userId,
        };
        mockData.rosters.push(created);
        return mockBuildRosterDTO(created);
    },

    listInventoryTypes: () => mockBuildInventoryTypeDTOs(),
    createInventoryType: (input: CreateInventoryTypeInput) => {
        const created: InventoryType = {
            Id: mockUuid(),
            Name: input.name,
            Description: input.description || '',
            Requestable: input.requestable !== false,
            ImageId: '',
            TotalQuantity: input.totalQuantity,
        };
        mockData.inventoryTypes.push(created);
        return mockBuildInventoryTypeDTOs().find((t) => t.Id === created.Id);
    },

    listInventoryRequests: (page: number) => {
        const items = mockData.inventoryRequests.map(mockBuildInventoryRequestDTO);
        return { items, page: page || 1, pageSize: 20, totalCount: items.length };
    },
    createInventoryRequest: (input: CreateInventoryRequestInput) => {
        const participants = mockParseParticipants(input.participants);
        const images = (input.images || []).slice(0, 3);
        const created: InventoryRequest = {
            Id: mockUuid(),
            DisplayId: mockData.nextDisplayId.inventory_request++,
            Name: input.name,
            UserId: mockData.currentUserId,
            StartDate: input.startDate,
            EndDate: input.endDate,
            Status: 'submitted',
            Image1Id: images[0] || '',
            Image2Id: images[1] || '',
            Image3Id: images[2] || '',
            Participants: participants.join(', '),
        };
        mockData.inventoryRequests.push(created);
        input.items.forEach((line) => {
            mockData.inventoryItems.push({
                Id: mockUuid(),
                RequestId: created.Id,
                InventoryTypeId: line.inventoryTypeId,
                Quantity: line.quantity,
                Condition: '',
            });
        });
        mockInsertActionComment(
            'inventory',
            created.Id,
            mockData.currentUserId,
            mockCurrentUser().Name + ' submitted this request.',
        );
        return mockBuildInventoryRequestDTO(created);
    },
    performInventoryRequestAction: (
        requestId: string,
        action: InventoryRequestAction,
        note: string,
        returnItems: ReturnItemInput[] | null,
    ) => {
        const request = mockData.inventoryRequests.find((r) => r.Id === requestId)!;
        if (!canTransitionInventoryRequest(request.Status, action))
            throw new Error('invalid_transition');
        const actorName = mockCurrentUser().Name;
        const actorId = mockData.currentUserId;

        if (action === 'submit') {
            request.Status = 'submitted';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' submitted this request.',
            );
        } else if (action === 'approve') {
            request.Status = 'approved';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' approved this request.' + (note ? ' ' + note : ''),
            );
        } else if (action === 'reject') {
            request.Status = 'rejected';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' rejected this request. ' + note,
            );
        } else if (action === 'issue') {
            request.Status = 'issued';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' issued the equipment.' + (note ? ' ' + note : ''),
            );
        } else if (action === 'return' && returnItems) {
            const summaries: string[] = [];
            returnItems.forEach((ret) => {
                const item = mockData.inventoryItems.find((i) => i.Id === ret.requestItemId)!;
                item.Condition = ret.condition;
                const type = mockData.inventoryTypes.find((t) => t.Id === item.InventoryTypeId);
                summaries.push(
                    item.Quantity + '× ' + (type ? type.Name : '') + ' (' + ret.condition + ')',
                );
            });
            request.Status = 'returned';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' returned ' + summaries.join(', ') + '.',
            );
        } else if (action === 'cancel') {
            request.Status = 'cancelled';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' cancelled this request. ' + note,
            );
        } else if (action === 'close') {
            request.Status = 'closed';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' closed this request.',
            );
        }
        return request.Status;
    },

    listProgramRequests: (page: number) => {
        const items = mockData.programRequests.map(mockBuildProgramRequestDTO);
        return { items, page: page || 1, pageSize: 20, totalCount: items.length };
    },
    createProgramRequest: (input: CreateProgramRequestInput) => {
        const participants = mockParseParticipants(input.participants);
        const created: ProgramRequest = {
            Id: mockUuid(),
            DisplayId: mockData.nextDisplayId.program_request++,
            Name: input.name,
            Type: input.type,
            UserId: mockData.currentUserId,
            Status: 'submitted',
            PlaceId: input.placeId,
            Participants: participants.join(', '),
        };
        mockData.programRequests.push(created);
        input.sessions.forEach((session) => {
            mockData.sessions.push({
                Id: mockUuid(),
                Name: session.name,
                Type: session.type,
                RequestId: created.Id,
                StartDateTime: session.startDateTime,
                EndDateTime: session.endDateTime,
            });
        });
        mockInsertActionComment(
            'program',
            created.Id,
            mockData.currentUserId,
            mockCurrentUser().Name + ' submitted this request.',
        );
        return mockBuildProgramRequestDTO(created);
    },
    performProgramRequestAction: (
        requestId: string,
        action: ProgramRequestAction,
        note: string,
    ) => {
        const request = mockData.programRequests.find((r) => r.Id === requestId)!;
        if (!canTransitionProgramRequest(request.Status, action))
            throw new Error('invalid_transition');
        const actorName = mockCurrentUser().Name;
        const actorId = mockData.currentUserId;

        if (action === 'submit') {
            request.Status = 'submitted';
            mockInsertActionComment(
                'program',
                requestId,
                actorId,
                actorName + ' submitted this request.',
            );
        } else if (action === 'approve') {
            request.Status = 'approved';
            mockInsertActionComment(
                'program',
                requestId,
                actorId,
                actorName + ' approved this request.' + (note ? ' ' + note : ''),
            );
        } else if (action === 'reject') {
            request.Status = 'rejected';
            mockInsertActionComment(
                'program',
                requestId,
                actorId,
                actorName + ' rejected this request. ' + note,
            );
        } else if (action === 'cancel') {
            request.Status = 'cancelled';
            mockInsertActionComment(
                'program',
                requestId,
                actorId,
                actorName + ' cancelled this request. ' + note,
            );
        } else if (action === 'close') {
            request.Status = 'closed';
            mockInsertActionComment(
                'program',
                requestId,
                actorId,
                actorName + ' closed this request.',
            );
        }
        return request.Status;
    },

    listTickets: (page: number) => {
        const items = mockData.tickets.map(mockBuildTicketDTO);
        return { items, page: page || 1, pageSize: 20, totalCount: items.length };
    },
    createTicket: (input: CreateTicketInput) => {
        const created: Ticket = {
            Id: mockUuid(),
            DisplayId: mockData.nextDisplayId.ticket++,
            Title: input.title,
            Description: input.description || '',
            Status: 'unassigned',
            AssigneeId: '',
        };
        mockData.tickets.push(created);
        return mockBuildTicketDTO(created);
    },
    performTicketAction: (ticketId: string, action: TicketAction, assigneeId: string | null) => {
        const ticket = mockData.tickets.find((t) => t.Id === ticketId)!;
        if (!canTransitionTicket(ticket.Status, action)) throw new Error('invalid_transition');
        if (action === 'assign') {
            ticket.Status = 'pending';
            ticket.AssigneeId = assigneeId || '';
        } else if (action === 'close') {
            ticket.Status = 'closed';
        } else if (action === 'reopen') {
            ticket.Status = 'pending';
        }
        return ticket.Status;
    },
    addComment: (requestId: string, message: string) => {
        const isInventory = mockData.inventoryRequests.some((r) => r.Id === requestId);
        const created = mockInsertActionComment(
            isInventory ? 'inventory' : 'program',
            requestId,
            mockData.currentUserId,
            message,
        );
        return mockBuildCommentDTO(created);
    },

    uploadImage: (_base64Data: string, fileName: string) => 'mock-image-' + mockUuid() + '-' + fileName,
};

function mockRunner(
    onSuccess: ((data: any) => void) | null,
    onFailure: ((error: any) => void) | null,
): any {
    return new Proxy(
        {},
        {
            get(_target, fnName: string) {
                return (...args: any[]) =>
                    window.setTimeout(
                        () => {
                            try {
                                const handler = mockHandlers[fnName];
                                if (!handler) throw new Error('No mock handler for ' + fnName);
                                const result = handler(...args);
                                if (onSuccess) onSuccess(result);
                            } catch (err) {
                                if (onFailure) onFailure(err);
                                else console.error(err);
                            }
                        },
                        300 + Math.random() * 500,
                    );
            },
        },
    );
}

(window as any).googleMock = {
    script: {
        run: {
            withSuccessHandler(onSuccess: (data: any) => void) {
                return {
                    withFailureHandler: (onFailure: (error: any) => void) =>
                        mockRunner(onSuccess, onFailure),
                    ...mockRunner(onSuccess, null),
                };
            },
            withFailureHandler(onFailure: (error: any) => void) {
                return {
                    withSuccessHandler: (onSuccess: (data: any) => void) =>
                        mockRunner(onSuccess, onFailure),
                };
            },
        },
    },
};
