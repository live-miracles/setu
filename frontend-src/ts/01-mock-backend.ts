// Local-dev-only stand-in for the Apps Script backend. Excluded from the
// production build (see build-tools/build.mjs). Rather than hand-writing one
// stub per backend function (multi-lang-qa's style, fine for 7 functions),
// this uses a generic Proxy so 02-api.ts's call sites are identical whether
// they end up talking to `google.script.run` or to this mock.

function mockNowIso(): string {
    return new Date().toISOString();
}

function mockUuid(): string {
    return 'mock-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const MOCK_SYSTEM_AUTHOR_ID = 'system';

const mockData = {
    currentUserId: 'user-1',
    profiles: [
        {
            Id: 'user-1',
            Email: 'admin@example.com',
            Name: 'Alex Admin',
            Role: 'admin' as UserRole,
            Status: 'active' as ProfileStatus,
            DepartmentId: 'dep-1',
            Timezone: 'Asia/Kolkata',
            Phone: '',
            Whatsapp: '',
            NotificationEmail: true,
        },
        {
            Id: 'user-2',
            Email: 'sam@example.com',
            Name: 'Sam Member',
            Role: 'member' as UserRole,
            Status: 'active' as ProfileStatus,
            DepartmentId: 'dep-1',
            Timezone: 'Asia/Kolkata',
            Phone: '',
            Whatsapp: '',
            NotificationEmail: true,
        },
        {
            Id: 'user-3',
            Email: 'riya@example.com',
            Name: 'Riya Crew',
            Role: 'member' as UserRole,
            Status: 'invited' as ProfileStatus,
            DepartmentId: '',
            Timezone: 'Asia/Kolkata',
            Phone: '',
            Whatsapp: '',
            NotificationEmail: true,
        },
    ] as Profile[],
    departments: [{ Id: 'dep-1', Name: 'Production', ShortName: 'PROD' }] as Department[],
    locations: [
        { Id: 'loc-1', Name: 'Studio A' },
        { Id: 'loc-2', Name: 'Studio B' },
    ] as Place[],
    equipmentTypes: [
        {
            Id: 'eq-1',
            Name: 'Camera',
            Description: 'Sony A7S III',
            Requestable: true,
            ImageDriveFileId: '',
            TotalQuantity: 3,
        },
        {
            Id: 'eq-2',
            Name: 'Microphone',
            Description: 'Shure SM7B',
            Requestable: true,
            ImageDriveFileId: '',
            TotalQuantity: 5,
        },
    ] as EquipmentType[],
    inventoryRequests: [
        {
            Id: 'req-1',
            DisplayId: 1,
            Title: 'Weekend shoot',
            RequesterId: 'user-2',
            FromDate: new Date().toISOString().slice(0, 10),
            ToDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
            Purpose: 'Outdoor interview',
            Status: 'submitted' as InventoryRequestStatus,
            AdminNote: '',
        },
    ] as InventoryRequest[],
    inventoryRequestItems: [
        {
            Id: 'reqitem-1',
            RequestId: 'req-1',
            EquipmentTypeId: 'eq-1',
            Quantity: 1,
            IssuedQuantity: 0,
            ReturnedQuantity: 0,
        },
    ] as InventoryRequestItem[],
    inventoryReturns: [] as InventoryReturn[],
    rosterShifts: [
        {
            Id: 'shift-1',
            StartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            EndDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            StartTime: '09:00',
            EndTime: '13:00',
            ShiftName: 'Morning',
            AssigneeProfileId: 'user-2',
        },
    ] as RosterShift[],
    tickets: [
        {
            Id: 'ticket-1',
            DisplayId: 1,
            Title: 'Projector flickering',
            Description: 'Studio A projector flickers after 30 minutes.',
            LocationId: 'loc-1',
            LocationName: 'Studio A',
            Priority: 'medium' as TicketPriority,
            Status: 'unassigned' as TicketStatus,
            ReporterId: 'user-2',
            AssigneeId: '',
        },
    ] as Ticket[],
    comments: [
        {
            Id: 'comment-1',
            OwnerType: 'inventory_request' as CommentOwnerType,
            OwnerId: 'req-1',
            AuthorId: MOCK_SYSTEM_AUTHOR_ID,
            Message: 'Sam Member submitted this request.',
            CreatedAt: mockNowIso(),
        },
    ] as CommentRecord[],
    links: [
        {
            Id: 'link-1',
            Name: 'Team wiki',
            Url: 'https://example.com/wiki',
            DisplayOrder: 0,
            Enabled: true,
        },
    ] as Link[],
    homeContent: {
        Id: 'singleton',
        SupportMessage: 'Reach out on WhatsApp for urgent issues.',
        Guidelines: 'Please return equipment within 24 hours of your shoot ending.',
        WhatsappUrl: 'https://wa.me/10000000000',
        TutorialUrl: '',
        UpdatedBy: 'user-1',
    } as HomeContent,
    nextDisplayId: { inventory_request: 2, ticket: 2 },
};

function mockCurrentProfile(): Profile {
    return mockData.profiles.find((p) => p.Id === mockData.currentUserId)!;
}

function mockToProfileDTO(profile: Profile): ProfileDTO {
    const department = mockData.departments.find((d) => d.Id === profile.DepartmentId);
    return Object.assign({}, profile, { departmentName: department ? department.Name : '' });
}

function mockBuildRosterShiftDTO(shift: RosterShift): RosterShiftDTO {
    const assignee = mockData.profiles.find((p) => p.Id === shift.AssigneeProfileId);
    return Object.assign({}, shift, { assigneeName: assignee ? assignee.Name : '' });
}

function mockComputeDeductionsByType(): Record<string, number> {
    const deductions: Record<string, number> = {};
    mockData.inventoryRequestItems.forEach((item) => {
        deductions[item.EquipmentTypeId] =
            (deductions[item.EquipmentTypeId] || 0) + (item.IssuedQuantity - item.ReturnedQuantity);
    });
    mockData.inventoryReturns.forEach((ret) => {
        if (ret.Condition === 'good') return;
        const item = mockData.inventoryRequestItems.find((i) => i.Id === ret.RequestItemId);
        if (!item) return;
        deductions[item.EquipmentTypeId] = (deductions[item.EquipmentTypeId] || 0) + ret.Quantity;
    });
    return deductions;
}

function mockBuildEquipmentTypeDTOs(): EquipmentTypeDTO[] {
    const deductions = mockComputeDeductionsByType();
    return mockData.equipmentTypes.map((t) =>
        Object.assign({}, t, { availableQuantity: t.TotalQuantity - (deductions[t.Id] || 0) }),
    );
}

function mockBuildCommentDTO(comment: CommentRecord): CommentDTO {
    const author = mockData.profiles.find((p) => p.Id === comment.AuthorId);
    const authorName =
        comment.AuthorId === MOCK_SYSTEM_AUTHOR_ID ? 'Setu' : author ? author.Name : '';
    return Object.assign({}, comment, { authorName });
}

function mockCommentsFor(ownerType: CommentOwnerType, ownerId: string): CommentDTO[] {
    return mockData.comments
        .filter((c) => c.OwnerType === ownerType && c.OwnerId === ownerId)
        .sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt))
        .map(mockBuildCommentDTO);
}

function mockInsertSystemComment(
    ownerType: CommentOwnerType,
    ownerId: string,
    message: string,
): void {
    mockData.comments.push({
        Id: mockUuid(),
        OwnerType: ownerType,
        OwnerId: ownerId,
        AuthorId: MOCK_SYSTEM_AUTHOR_ID,
        Message: message,
        CreatedAt: mockNowIso(),
    });
}

function mockBuildInventoryRequestDTO(request: InventoryRequest): InventoryRequestDTO {
    const requester = mockData.profiles.find((p) => p.Id === request.RequesterId);
    const items = mockData.inventoryRequestItems
        .filter((i) => i.RequestId === request.Id)
        .map((i) => {
            const type = mockData.equipmentTypes.find((t) => t.Id === i.EquipmentTypeId);
            return Object.assign({}, i, { itemName: type ? type.Name : '' });
        });
    return Object.assign({}, request, {
        requesterName: requester ? requester.Name : '',
        items,
        comments: mockCommentsFor('inventory_request', request.Id),
    });
}

function mockBuildTicketDTO(ticket: Ticket): TicketDTO {
    const reporter = mockData.profiles.find((p) => p.Id === ticket.ReporterId);
    const assignee = mockData.profiles.find((p) => p.Id === ticket.AssigneeId);
    return Object.assign({}, ticket, {
        reporterName: reporter ? reporter.Name : '',
        assigneeName: assignee ? assignee.Name : '',
    });
}

function mockBuildDashboard(): DashboardPayload {
    return {
        me: mockToProfileDTO(mockCurrentProfile()),
        departments: mockData.departments,
        locations: mockData.locations,
        equipmentTypes: mockBuildEquipmentTypeDTOs(),
        upcomingShifts: mockData.rosterShifts.map(mockBuildRosterShiftDTO),
        inventoryRequests: mockData.inventoryRequests.map(mockBuildInventoryRequestDTO),
        tickets: mockData.tickets.map(mockBuildTicketDTO),
        links: mockData.links.filter((l) => l.Enabled),
        homeContent: mockData.homeContent,
        failedNotificationCount: 0,
    };
}

const mockHandlers: Record<string, (...args: any[]) => any> = {
    whoAmI: () => mockToProfileDTO(mockCurrentProfile()),
    getDashboard: () => mockBuildDashboard(),

    listUsers: () => mockData.profiles.map(mockToProfileDTO),
    inviteUser: (input: InviteUserInput) => {
        const created: Profile = {
            Id: mockUuid(),
            Email: input.email.toLowerCase(),
            Name: input.name,
            Role: input.role,
            Status: 'invited',
            DepartmentId: input.departmentId || '',
            Timezone: input.timezone || 'Asia/Kolkata',
            Phone: '',
            Whatsapp: '',
            NotificationEmail: true,
        };
        mockData.profiles.push(created);
        return mockToProfileDTO(created);
    },
    updateUser: (profileId: string, patch: UpdateUserInput) => {
        const profile = mockData.profiles.find((p) => p.Id === profileId)!;
        Object.assign(profile, patch);
        return mockToProfileDTO(profile);
    },
    updateOwnProfile: (patch: UpdateOwnProfileInput) => {
        const profile = mockCurrentProfile();
        Object.assign(profile, patch);
        return mockToProfileDTO(profile);
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

    listLocations: () => mockData.locations,
    createLocation: (input: CreateLocationInput) => {
        const created: Place = { Id: mockUuid(), Name: input.name };
        mockData.locations.push(created);
        return created;
    },

    listLinks: () => mockData.links,
    createLink: (input: CreateLinkInput) => {
        const created: Link = {
            Id: mockUuid(),
            Name: input.name,
            Url: input.url,
            DisplayOrder: input.displayOrder || 0,
            Enabled: input.enabled !== false,
        };
        mockData.links.push(created);
        return created;
    },

    getHomeContent: () => mockData.homeContent,
    updateHomeContent: (input: UpdateHomeContentInput) => {
        Object.assign(mockData.homeContent, input, { UpdatedBy: mockData.currentUserId });
        return mockData.homeContent;
    },

    listRosterShifts: (page: number) => {
        const items = mockData.rosterShifts.map(mockBuildRosterShiftDTO);
        return { items, page: page || 1, pageSize: 20, totalCount: items.length };
    },
    createRosterShift: (input: CreateRosterShiftInput) => {
        const created: RosterShift = {
            Id: mockUuid(),
            StartDate: input.startDate,
            EndDate: input.endDate,
            StartTime: input.startTime || '',
            EndTime: input.endTime || '',
            ShiftName: input.shiftName,
            AssigneeProfileId: input.assigneeProfileId,
        };
        mockData.rosterShifts.push(created);
        return mockBuildRosterShiftDTO(created);
    },

    listEquipmentTypes: () => mockBuildEquipmentTypeDTOs(),
    createEquipmentType: (input: CreateEquipmentTypeInput) => {
        const created: EquipmentType = {
            Id: mockUuid(),
            Name: input.name,
            Description: input.description || '',
            Requestable: input.requestable !== false,
            ImageDriveFileId: '',
            TotalQuantity: input.totalQuantity,
        };
        mockData.equipmentTypes.push(created);
        return mockBuildEquipmentTypeDTOs().find((t) => t.Id === created.Id);
    },

    listInventoryRequests: (page: number) => {
        const items = mockData.inventoryRequests.map(mockBuildInventoryRequestDTO);
        return { items, page: page || 1, pageSize: 20, totalCount: items.length };
    },
    createInventoryRequest: (input: CreateInventoryRequestInput) => {
        const created: InventoryRequest = {
            Id: mockUuid(),
            DisplayId: mockData.nextDisplayId.inventory_request++,
            Title: input.title,
            RequesterId: mockData.currentUserId,
            FromDate: input.fromDate,
            ToDate: input.toDate,
            Purpose: input.purpose || '',
            Status: 'submitted',
            AdminNote: '',
        };
        mockData.inventoryRequests.push(created);
        input.items.forEach((line) => {
            mockData.inventoryRequestItems.push({
                Id: mockUuid(),
                RequestId: created.Id,
                EquipmentTypeId: line.equipmentTypeId,
                Quantity: line.quantity,
                IssuedQuantity: 0,
                ReturnedQuantity: 0,
            });
        });
        mockInsertSystemComment(
            'inventory_request',
            created.Id,
            mockCurrentProfile().Name + ' submitted this request.',
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
        const actorName = mockCurrentProfile().Name;

        if (action === 'submit') {
            request.Status = 'submitted';
            mockInsertSystemComment(
                'inventory_request',
                requestId,
                actorName + ' submitted this request.',
            );
        } else if (action === 'approve') {
            request.Status = 'approved';
            mockInsertSystemComment(
                'inventory_request',
                requestId,
                actorName + ' approved this request.' + (note ? ' ' + note : ''),
            );
        } else if (action === 'reject') {
            request.Status = 'rejected';
            request.AdminNote = note;
            mockInsertSystemComment(
                'inventory_request',
                requestId,
                actorName + ' rejected this request. ' + note,
            );
        } else if (action === 'issue') {
            request.Status = 'issued';
            mockData.inventoryRequestItems
                .filter((i) => i.RequestId === requestId)
                .forEach((item) => {
                    item.IssuedQuantity = item.Quantity;
                });
            mockInsertSystemComment(
                'inventory_request',
                requestId,
                actorName + ' issued the equipment.' + (note ? ' ' + note : ''),
            );
        } else if (action === 'return' && returnItems) {
            const summaries: string[] = [];
            returnItems.forEach((ret) => {
                const item = mockData.inventoryRequestItems.find(
                    (i) => i.Id === ret.requestItemId,
                )!;
                item.ReturnedQuantity += ret.quantity;
                mockData.inventoryReturns.push({
                    Id: mockUuid(),
                    RequestItemId: item.Id,
                    Quantity: ret.quantity,
                    Condition: ret.condition,
                    Notes: ret.notes,
                    ReceivedBy: mockData.currentUserId,
                });
                const type = mockData.equipmentTypes.find((t) => t.Id === item.EquipmentTypeId);
                summaries.push(ret.quantity + '× ' + (type ? type.Name : '') + ' (' + ret.condition + ')');
            });
            const allReturned = mockData.inventoryRequestItems
                .filter((i) => i.RequestId === requestId)
                .every((i) => i.ReturnedQuantity >= i.IssuedQuantity);
            request.Status = allReturned ? 'returned' : 'issued';
            mockInsertSystemComment(
                'inventory_request',
                requestId,
                actorName + ' returned ' + summaries.join(', ') + '.',
            );
        } else if (action === 'cancel') {
            request.Status = 'cancelled';
            request.AdminNote = note;
            mockInsertSystemComment(
                'inventory_request',
                requestId,
                actorName + ' cancelled this request. ' + note,
            );
        } else if (action === 'close') {
            request.Status = 'closed';
            mockInsertSystemComment(
                'inventory_request',
                requestId,
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
        const location = mockData.locations.find((l) => l.Id === input.locationId)!;
        const created: Ticket = {
            Id: mockUuid(),
            DisplayId: mockData.nextDisplayId.ticket++,
            Title: input.title,
            Description: input.description || '',
            LocationId: input.locationId,
            LocationName: location.Name,
            Priority: input.priority,
            Status: 'unassigned',
            ReporterId: mockData.currentUserId,
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
    addComment: (ownerType: CommentOwnerType, ownerId: string, message: string) => {
        const created: CommentRecord = {
            Id: mockUuid(),
            OwnerType: ownerType,
            OwnerId: ownerId,
            AuthorId: mockData.currentUserId,
            Message: message,
            CreatedAt: mockNowIso(),
        };
        mockData.comments.push(created);
        return mockBuildCommentDTO(created);
    },
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
