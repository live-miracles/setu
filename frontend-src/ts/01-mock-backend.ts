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
            AvatarDriveFileId: '',
            NotificationEmail: true,
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
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
            AvatarDriveFileId: '',
            NotificationEmail: true,
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
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
            AvatarDriveFileId: '',
            NotificationEmail: true,
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
    ] as Profile[],
    departments: [
        {
            Id: 'dep-1',
            Name: 'Production',
            ShortName: 'PROD',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
    ] as Department[],
    locations: [
        { Id: 'loc-1', Name: 'Studio A', CreatedAt: mockNowIso(), UpdatedAt: mockNowIso() },
        { Id: 'loc-2', Name: 'Studio B', CreatedAt: mockNowIso(), UpdatedAt: mockNowIso() },
    ] as LocationRecord[],
    equipmentTypes: [
        {
            Id: 'eq-1',
            Name: 'Camera',
            Description: '',
            Requestable: true,
            ImageDriveFileId: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
        {
            Id: 'eq-2',
            Name: 'Microphone',
            Description: '',
            Requestable: true,
            ImageDriveFileId: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
    ] as EquipmentType[],
    inventoryItems: [
        {
            Id: 'item-1',
            EquipmentTypeId: 'eq-1',
            Name: 'Sony A7S III',
            LocationId: 'loc-1',
            SerialNumber: 'SN-001',
            TotalQuantity: 3,
            AvailableQuantity: 2,
            ImageDriveFileId: '',
            AdminNotes: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
        {
            Id: 'item-2',
            EquipmentTypeId: 'eq-2',
            Name: 'Shure SM7B',
            LocationId: 'loc-1',
            SerialNumber: 'SN-002',
            TotalQuantity: 5,
            AvailableQuantity: 5,
            ImageDriveFileId: '',
            AdminNotes: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
    ] as InventoryItem[],
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
            SubmittedAt: mockNowIso(),
            ApprovedAt: '',
            IssuedAt: '',
            ReturnedAt: '',
            ClosedAt: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
    ] as InventoryRequest[],
    inventoryRequestItems: [
        {
            Id: 'reqitem-1',
            RequestId: 'req-1',
            InventoryItemId: 'item-1',
            Quantity: 1,
            IssuedQuantity: 0,
            ReturnedQuantity: 0,
            CreatedAt: mockNowIso(),
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
            CreatedBy: 'user-1',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
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
            ClosedAt: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
    ] as Ticket[],
    ticketComments: [] as TicketComment[],
    links: [
        {
            Id: 'link-1',
            Name: 'Team wiki',
            Url: 'https://example.com/wiki',
            DisplayOrder: 0,
            Enabled: true,
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        },
    ] as Link[],
    homeContent: {
        Id: 'singleton',
        SupportMessage: 'Reach out on WhatsApp for urgent issues.',
        Guidelines: 'Please return equipment within 24 hours of your shoot ending.',
        WhatsappUrl: 'https://wa.me/10000000000',
        TutorialUrl: '',
        UpdatedBy: 'user-1',
        UpdatedAt: mockNowIso(),
    } as HomeContent,
    nextDisplayId: { inventory_request: 2, ticket: 2 },
};

function mockCurrentProfile(): Profile {
    return mockData.profiles.find((p) => p.Id === mockData.currentUserId)!;
}

function mockToProfileDTO(profile: Profile): ProfileDTO {
    const department = mockData.departments.find((d) => d.Id === profile.DepartmentId);
    const { AvatarDriveFileId, ...rest } = profile;
    return Object.assign({}, rest, { departmentName: department ? department.Name : '' });
}

function mockBuildRosterShiftDTO(shift: RosterShift): RosterShiftDTO {
    const assignee = mockData.profiles.find((p) => p.Id === shift.AssigneeProfileId);
    return Object.assign({}, shift, { assigneeName: assignee ? assignee.Name : '' });
}

function mockBuildInventoryItemDTO(item: InventoryItem): InventoryItemDTO {
    const equipmentType = mockData.equipmentTypes.find((t) => t.Id === item.EquipmentTypeId);
    const location = mockData.locations.find((l) => l.Id === item.LocationId);
    return Object.assign({}, item, {
        equipmentTypeName: equipmentType ? equipmentType.Name : '',
        locationName: location ? location.Name : '',
    });
}

function mockBuildInventoryRequestDTO(request: InventoryRequest): InventoryRequestDTO {
    const requester = mockData.profiles.find((p) => p.Id === request.RequesterId);
    const items = mockData.inventoryRequestItems
        .filter((i) => i.RequestId === request.Id)
        .map((i) => {
            const item = mockData.inventoryItems.find((inv) => inv.Id === i.InventoryItemId);
            return Object.assign({}, i, { itemName: item ? item.Name : '' });
        });
    return Object.assign({}, request, { requesterName: requester ? requester.Name : '', items });
}

function mockBuildTicketDTO(ticket: Ticket): TicketDTO {
    const reporter = mockData.profiles.find((p) => p.Id === ticket.ReporterId);
    const assignee = mockData.profiles.find((p) => p.Id === ticket.AssigneeId);
    const comments = mockData.ticketComments
        .filter((c) => c.TicketId === ticket.Id)
        .map((c) => {
            const author = mockData.profiles.find((p) => p.Id === c.AuthorId);
            return Object.assign({}, c, { authorName: author ? author.Name : '' });
        });
    return Object.assign({}, ticket, {
        reporterName: reporter ? reporter.Name : '',
        assigneeName: assignee ? assignee.Name : '',
        comments,
    });
}

function mockBuildDashboard(): DashboardPayload {
    return {
        me: mockToProfileDTO(mockCurrentProfile()),
        departments: mockData.departments,
        locations: mockData.locations,
        equipmentTypes: mockData.equipmentTypes,
        upcomingShifts: mockData.rosterShifts.map(mockBuildRosterShiftDTO),
        inventoryItems: mockData.inventoryItems.map(mockBuildInventoryItemDTO),
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
            AvatarDriveFileId: '',
            NotificationEmail: true,
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
        mockData.profiles.push(created);
        return mockToProfileDTO(created);
    },
    updateUser: (profileId: string, patch: UpdateUserInput) => {
        const profile = mockData.profiles.find((p) => p.Id === profileId)!;
        Object.assign(profile, patch, { UpdatedAt: mockNowIso() });
        return mockToProfileDTO(profile);
    },
    updateOwnProfile: (patch: UpdateOwnProfileInput) => {
        const profile = mockCurrentProfile();
        Object.assign(profile, patch, { UpdatedAt: mockNowIso() });
        return mockToProfileDTO(profile);
    },

    listDepartments: () => mockData.departments,
    createDepartment: (input: CreateDepartmentInput) => {
        const created: Department = {
            Id: mockUuid(),
            Name: input.name,
            ShortName: input.shortName || '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
        mockData.departments.push(created);
        return created;
    },

    listLocations: () => mockData.locations,
    createLocation: (input: CreateLocationInput) => {
        const created: LocationRecord = {
            Id: mockUuid(),
            Name: input.name,
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
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
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
        mockData.links.push(created);
        return created;
    },

    getHomeContent: () => mockData.homeContent,
    updateHomeContent: (input: UpdateHomeContentInput) => {
        Object.assign(mockData.homeContent, input, {
            UpdatedBy: mockData.currentUserId,
            UpdatedAt: mockNowIso(),
        });
        return mockData.homeContent;
    },
    listActivityLog: (page: number) => ({
        items: [],
        page: page || 1,
        pageSize: 50,
        totalCount: 0,
    }),

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
            CreatedBy: mockData.currentUserId,
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
        mockData.rosterShifts.push(created);
        return mockBuildRosterShiftDTO(created);
    },

    listEquipmentTypes: () => mockData.equipmentTypes,
    createEquipmentType: (input: CreateEquipmentTypeInput) => {
        const created: EquipmentType = {
            Id: mockUuid(),
            Name: input.name,
            Description: input.description || '',
            Requestable: input.requestable !== false,
            ImageDriveFileId: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
        mockData.equipmentTypes.push(created);
        return created;
    },

    listInventoryItems: (page: number) => {
        const items = mockData.inventoryItems.map(mockBuildInventoryItemDTO);
        return { items, page: page || 1, pageSize: 30, totalCount: items.length };
    },
    createInventoryItem: (input: CreateInventoryItemInput) => {
        const created: InventoryItem = {
            Id: mockUuid(),
            EquipmentTypeId: input.equipmentTypeId,
            Name: input.name,
            LocationId: input.locationId,
            SerialNumber: input.serialNumber || '',
            TotalQuantity: input.totalQuantity,
            AvailableQuantity: input.totalQuantity,
            ImageDriveFileId: '',
            AdminNotes: input.adminNotes || '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
        mockData.inventoryItems.push(created);
        return mockBuildInventoryItemDTO(created);
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
            SubmittedAt: mockNowIso(),
            ApprovedAt: '',
            IssuedAt: '',
            ReturnedAt: '',
            ClosedAt: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
        };
        mockData.inventoryRequests.push(created);
        input.items.forEach((line) => {
            mockData.inventoryRequestItems.push({
                Id: mockUuid(),
                RequestId: created.Id,
                InventoryItemId: line.inventoryItemId,
                Quantity: line.quantity,
                IssuedQuantity: 0,
                ReturnedQuantity: 0,
                CreatedAt: mockNowIso(),
            });
        });
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

        if (action === 'submit') request.Status = 'submitted';
        else if (action === 'approve') request.Status = 'approved';
        else if (action === 'reject') {
            request.Status = 'rejected';
            request.AdminNote = note;
        } else if (action === 'issue') {
            request.Status = 'issued';
            mockData.inventoryRequestItems
                .filter((i) => i.RequestId === requestId)
                .forEach((item) => {
                    item.IssuedQuantity = item.Quantity;
                    const invItem = mockData.inventoryItems.find(
                        (inv) => inv.Id === item.InventoryItemId,
                    )!;
                    invItem.AvailableQuantity -= item.Quantity;
                });
        } else if (action === 'return' && returnItems) {
            returnItems.forEach((ret) => {
                const item = mockData.inventoryRequestItems.find(
                    (i) => i.Id === ret.requestItemId,
                )!;
                item.ReturnedQuantity += ret.quantity;
                if (ret.condition === 'good') {
                    const invItem = mockData.inventoryItems.find(
                        (inv) => inv.Id === item.InventoryItemId,
                    )!;
                    invItem.AvailableQuantity += ret.quantity;
                }
            });
            const allReturned = mockData.inventoryRequestItems
                .filter((i) => i.RequestId === requestId)
                .every((i) => i.ReturnedQuantity >= i.IssuedQuantity);
            request.Status = allReturned ? 'returned' : 'issued';
        } else if (action === 'cancel') {
            request.Status = 'cancelled';
            request.AdminNote = note;
        } else if (action === 'close') {
            request.Status = 'closed';
        }
        request.UpdatedAt = mockNowIso();
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
            ClosedAt: '',
            CreatedAt: mockNowIso(),
            UpdatedAt: mockNowIso(),
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
            ticket.ClosedAt = '';
        } else if (action === 'close') {
            ticket.Status = 'closed';
            ticket.ClosedAt = mockNowIso();
        } else if (action === 'reopen') {
            ticket.Status = 'pending';
            ticket.ClosedAt = '';
        }
        ticket.UpdatedAt = mockNowIso();
        return ticket.Status;
    },
    addTicketComment: (ticketId: string, message: string) => {
        const created: TicketComment = {
            Id: mockUuid(),
            TicketId: ticketId,
            AuthorId: mockData.currentUserId,
            Message: message,
            CreatedAt: mockNowIso(),
        };
        mockData.ticketComments.push(created);
        return Object.assign({}, created, { authorName: mockCurrentProfile().Name });
    },

    uploadAttachmentChunk: (uploadId: string, chunkIndex: number, totalChunks: number) => ({
        received: chunkIndex + 1,
        of: totalChunks,
    }),
    finishAttachmentUpload: (
        uploadId: string,
        ownerType: AttachmentOwnerType,
        ownerId: string,
        fileName: string,
        contentType: string,
        sizeBytes: number,
    ) => ({
        Id: mockUuid(),
        DriveFileId: mockUuid(),
        OriginalName: fileName,
        ContentType: contentType,
        SizeBytes: sizeBytes,
    }),
    getAttachmentContent: () => ({
        base64: '',
        contentType: 'application/octet-stream',
        fileName: 'mock-file',
    }),
    listAttachmentsFor: () => [],
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
