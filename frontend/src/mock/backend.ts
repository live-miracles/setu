import { refreshDashboard } from '../router';
import {
    canApprove,
    canTransitionInventoryRequest,
    canTransitionProgramRequest,
    canTransitionTicket,
    canUseTickets,
} from '../workflows';

// Local-dev-only stand-in for the Apps Script backend. Excluded from the
// production build: main.ts, the entry point build.mjs bundles, has no
// import path that reaches this file. Rather than hand-writing one
// stub per backend function, this uses a generic Proxy so api.ts's call
// sites are identical whether they end up talking to `google.script.run` or
// to this mock.

function mockNowIso(): string {
    return new Date().toISOString();
}

function mockUuid(): string {
    return 'mock-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function mockAddDays(days: number): string {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
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
            Email: 'ana@example.com',
            Name: 'Ana Approver',
            Role: 'approver' as UserRole,
            DepartmentId: 'dep-1',
            Timezone: 'Asia/Kolkata',
            Phone: '+91 90000 00002',
            Whatsapp: '',
        },
        {
            Email: 'vic@example.com',
            Name: 'Vic Viewer',
            Role: 'viewer' as UserRole,
            DepartmentId: 'dep-1',
            Timezone: 'Asia/Kolkata',
            Phone: '+91 90000 00003',
            Whatsapp: '',
        },
        {
            Email: 'sam@example.com',
            Name: 'Sam User',
            Role: 'user' as UserRole,
            DepartmentId: 'dep-1',
            Timezone: 'Asia/Kolkata',
            Phone: '+91 90000 00004',
            Whatsapp: '',
        },
    ] as User[],
    departments: [
        { Id: 'dep-1', Name: 'Production', ShortName: 'PROD' },
        { Id: 'dep-2', Name: 'Post-Production', ShortName: 'POST' },
        { Id: 'dep-3', Name: 'Marketing', ShortName: 'MKTG' },
        { Id: 'dep-4', Name: 'Engineering', ShortName: 'ENG' },
        { Id: 'dep-5', Name: 'Operations', ShortName: 'OPS' },
        { Id: 'dep-6', Name: 'Finance', ShortName: 'FIN' },
    ] as Department[],
    places: [
        { Id: 'place-1', Name: 'Studio A' },
        { Id: 'place-2', Name: 'Studio B' },
        { Id: 'place-3', Name: 'Studio C' },
        { Id: 'place-4', Name: 'Edit Suite 1' },
        { Id: 'place-5', Name: 'Podcast Room' },
        { Id: 'place-6', Name: 'Green Room' },
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
            StartDate: mockAddDays(0),
            EndDate: mockAddDays(3),
            Status: 'submitted' as InventoryRequestStatus,
            Image1Id: '',
            Image2Id: '',
            Image3Id: '',
            Participants: '',
        },
        {
            Id: 'req-2',
            DisplayId: 2,
            Name: 'Evening satsang audio',
            UserId: 'ana@example.com',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(2),
            Status: 'approved' as InventoryRequestStatus,
            Image1Id: '',
            Image2Id: '',
            Image3Id: '',
            Participants: 'sam@example.com',
        },
        {
            Id: 'req-3',
            DisplayId: 3,
            Name: 'Temple livestream kit',
            UserId: 'vic@example.com',
            StartDate: mockAddDays(-5),
            EndDate: mockAddDays(-2),
            Status: 'issued' as InventoryRequestStatus,
            Image1Id: '',
            Image2Id: '',
            Image3Id: '',
            Participants: '',
        },
        {
            Id: 'req-4',
            DisplayId: 4,
            Name: 'Guest interview setup',
            UserId: 'sam@example.com',
            StartDate: mockAddDays(-7),
            EndDate: mockAddDays(-6),
            Status: 'returned' as InventoryRequestStatus,
            Image1Id: '',
            Image2Id: '',
            Image3Id: '',
            Participants: '',
        },
        {
            Id: 'req-5',
            DisplayId: 5,
            Name: 'Podcast room recording',
            UserId: 'ana@example.com',
            StartDate: mockAddDays(-12),
            EndDate: mockAddDays(-11),
            Status: 'closed' as InventoryRequestStatus,
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
        {
            Id: 'reqitem-2',
            RequestId: 'req-2',
            InventoryTypeId: 'inv-2',
            Quantity: 2,
            Condition: '' as ReturnCondition | '',
        },
        {
            Id: 'reqitem-3',
            RequestId: 'req-3',
            InventoryTypeId: 'inv-1',
            Quantity: 1,
            Condition: '' as ReturnCondition | '',
        },
        {
            Id: 'reqitem-4',
            RequestId: 'req-4',
            InventoryTypeId: 'inv-1',
            Quantity: 1,
            Condition: 'good' as ReturnCondition,
        },
        {
            Id: 'reqitem-5',
            RequestId: 'req-5',
            InventoryTypeId: 'inv-2',
            Quantity: 1,
            Condition: 'good' as ReturnCondition,
        },
    ] as InventoryItem[],
    programRequests: [
        {
            Id: 'program-1',
            DisplayId: 21,
            Name: 'Sunday Satsang',
            Type: 'Livestream',
            UserId: 'sam@example.com',
            Status: 'submitted' as ProgramRequestStatus,
            PlaceId: 'place-1',
            Participants: 'ana@example.com',
        },
        {
            Id: 'program-2',
            DisplayId: 22,
            Name: 'Podcast recording',
            Type: 'Recording',
            UserId: 'ana@example.com',
            Status: 'approved' as ProgramRequestStatus,
            PlaceId: 'place-5',
            Participants: '',
        },
        {
            Id: 'program-3',
            DisplayId: 23,
            Name: 'Volunteer orientation',
            Type: 'Webinar',
            UserId: 'vic@example.com',
            Status: 'draft' as ProgramRequestStatus,
            PlaceId: 'place-2',
            Participants: '',
        },
        {
            Id: 'program-4',
            DisplayId: 24,
            Name: 'Festival rehearsal',
            Type: 'Dry run',
            UserId: 'admin@example.com',
            Status: 'cancelled' as ProgramRequestStatus,
            PlaceId: 'place-3',
            Participants: '',
        },
        {
            Id: 'program-5',
            DisplayId: 25,
            Name: 'Monthly review',
            Type: 'Meeting',
            UserId: 'admin@example.com',
            Status: 'closed' as ProgramRequestStatus,
            PlaceId: 'place-4',
            Participants: '',
        },
    ] as ProgramRequest[],
    sessions: [
        {
            Id: 'session-1',
            Name: 'Main session',
            Type: 'Live',
            RequestId: 'program-1',
            StartDateTime: mockAddDays(2) + 'T07:00:00.000Z',
            EndDateTime: mockAddDays(2) + 'T10:00:00.000Z',
        },
        {
            Id: 'session-2',
            Name: 'Sound check',
            Type: 'Setup',
            RequestId: 'program-1',
            StartDateTime: mockAddDays(2) + 'T05:30:00.000Z',
            EndDateTime: mockAddDays(2) + 'T06:30:00.000Z',
        },
        {
            Id: 'session-3',
            Name: 'Interview',
            Type: 'Recording',
            RequestId: 'program-2',
            StartDateTime: mockAddDays(4) + 'T09:00:00.000Z',
            EndDateTime: mockAddDays(4) + 'T11:00:00.000Z',
        },
        {
            Id: 'session-4',
            Name: 'Orientation',
            Type: 'Webinar',
            RequestId: 'program-3',
            StartDateTime: mockAddDays(6) + 'T12:00:00.000Z',
            EndDateTime: mockAddDays(6) + 'T13:30:00.000Z',
        },
        {
            Id: 'session-5',
            Name: 'Rehearsal',
            Type: 'Dry run',
            RequestId: 'program-4',
            StartDateTime: mockAddDays(1) + 'T14:00:00.000Z',
            EndDateTime: mockAddDays(1) + 'T16:00:00.000Z',
        },
        {
            Id: 'session-6',
            Name: 'Review',
            Type: 'Meeting',
            RequestId: 'program-5',
            StartDateTime: mockAddDays(-2) + 'T10:00:00.000Z',
            EndDateTime: mockAddDays(-2) + 'T11:00:00.000Z',
        },
    ] as ProgramSession[],
    rosters: [
        {
            // Same day/name/time as roster-2 below - the calendar merges the
            // two into one block listing both assignees. Times match the
            // Morning shift preset.
            Id: 'roster-1',
            Name: 'Morning',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(1),
            StartTime: '04:00',
            EndTime: '13:30',
            UserId: 'sam@example.com',
        },
        {
            Id: 'roster-2',
            Name: 'Morning',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(1),
            StartTime: '04:00',
            EndTime: '13:30',
            UserId: 'ana@example.com',
        },
        {
            // Multi-day range - appears on the calendar every day from
            // start to end. Times match the Evening shift preset.
            Id: 'roster-3',
            Name: 'Evening',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(3),
            StartTime: '13:30',
            EndTime: '22:00',
            UserId: 'vic@example.com',
        },
        {
            // Times match the Night shift preset.
            Id: 'roster-4',
            Name: 'Night',
            StartDate: mockAddDays(2),
            EndDate: mockAddDays(2),
            StartTime: '22:00',
            EndTime: '04:00',
            UserId: 'sam@example.com',
        },
        {
            // No start/end time set - the calendar treats this as an
            // all-day 00:00-24:00 block, matching the Day shift preset
            // (also always full-day).
            Id: 'roster-5',
            Name: 'Day',
            StartDate: mockAddDays(4),
            EndDate: mockAddDays(4),
            StartTime: '',
            EndTime: '',
            UserId: 'ana@example.com',
        },
        {
            // Custom name (not a preset) with its end time left blank -
            // defaults to 24:00.
            Id: 'roster-6',
            Name: 'Overnight standby',
            StartDate: mockAddDays(5),
            EndDate: mockAddDays(6),
            StartTime: '20:00',
            EndTime: '',
            UserId: 'vic@example.com',
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
        {
            Id: 'ticket-2',
            DisplayId: 2,
            Title: 'Audio delay in Studio B',
            Description: 'Audio is approximately two seconds behind video.',
            Status: 'pending' as TicketStatus,
            AssigneeId: 'ana@example.com',
        },
        {
            Id: 'ticket-3',
            DisplayId: 3,
            Title: 'Intercom battery replaced',
            Description: 'Replacement completed and tested.',
            Status: 'closed' as TicketStatus,
            AssigneeId: 'admin@example.com',
        },
    ] as Ticket[],
    comments: [
        {
            Id: 'comment-1',
            Timestamp: mockNowIso(),
            ProgramRequestId: '',
            InventoryRequestId: 'req-1',
            UserId: 'sam@example.com',
            Message: 'Sam User submitted this request.',
        },
        {
            Id: 'comment-2',
            Timestamp: mockNowIso(),
            ProgramRequestId: '',
            InventoryRequestId: 'req-2',
            UserId: 'admin@example.com',
            Message: 'Alex Admin approved this request.',
        },
        {
            Id: 'comment-3',
            Timestamp: mockNowIso(),
            ProgramRequestId: '',
            InventoryRequestId: 'req-3',
            UserId: 'admin@example.com',
            Message: 'Alex Admin issued this equipment.',
        },
        {
            Id: 'comment-4',
            Timestamp: mockNowIso(),
            ProgramRequestId: '',
            InventoryRequestId: 'req-4',
            UserId: 'admin@example.com',
            Message: 'Alex Admin recorded the returned equipment.',
        },
        {
            Id: 'comment-5',
            Timestamp: mockNowIso(),
            ProgramRequestId: '',
            InventoryRequestId: 'req-5',
            UserId: 'admin@example.com',
            Message: 'Alex Admin closed this request.',
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
    shiftPresets: [
        {
            Id: 'shift-preset-1',
            Name: 'Morning',
            DefaultStartTime: '04:00',
            DefaultEndTime: '13:30',
        },
        {
            Id: 'shift-preset-2',
            Name: 'Evening',
            DefaultStartTime: '13:30',
            DefaultEndTime: '22:00',
        },
        { Id: 'shift-preset-3', Name: 'Night', DefaultStartTime: '22:00', DefaultEndTime: '04:00' },
        // Blank times mean the full day - see the Roster.StartTime/EndTime
        // comment in shared/types.d.ts and isAllDayShiftBlock in roster.ts.
        { Id: 'shift-preset-4', Name: 'Day', DefaultStartTime: '', DefaultEndTime: '' },
        { Id: 'shift-preset-5', Name: 'Vacation', DefaultStartTime: '', DefaultEndTime: '' },
    ] as ShiftPreset[],
    nextDisplayId: { inventory_request: 6, program_request: 1, ticket: 2 },
};

function mockCurrentUser(): User {
    return mockData.users.find((u) => u.Email === mockData.currentUserId)!;
}

// Mirrors canViewRequest in Auth.ts, so the scoped lists a `user` sees
// locally match what the real backend would actually return.
function mockCanViewRequest(request: { UserId: string; Participants: string }): boolean {
    const me = mockCurrentUser();
    if (me.Role !== 'user') return true;
    return (
        request.UserId === me.Email ||
        mockParseParticipants(request.Participants).indexOf(me.Email) !== -1
    );
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

function mockIncludes(query: string | undefined, values: unknown[]): boolean {
    const needle = String(query || '')
        .trim()
        .toLocaleLowerCase();
    return (
        !needle ||
        values.some((value) =>
            String(value || '')
                .toLocaleLowerCase()
                .includes(needle),
        )
    );
}

function mockPaginate<T>(items: T[], page: number): Paginated<T> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const pageSize = 20;
    return {
        items: items.slice((safePage - 1) * pageSize, safePage * pageSize),
        page: safePage,
        pageSize,
        totalCount: items.length,
    };
}

function mockCompare(left: unknown, right: unknown, direction: SortDirection): number {
    const result = String(left || '').localeCompare(String(right || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
    return direction === 'asc' ? result : -result;
}

function mockBuildDashboard(): DashboardPayload {
    return {
        me: mockToUserDTO(mockCurrentUser()),
        departments: mockData.departments,
        places: mockData.places,
        inventoryTypes: mockBuildInventoryTypeDTOs(),
        upcomingRosters: canApprove(mockToUserDTO(mockCurrentUser()))
            ? mockData.rosters.map(mockBuildRosterDTO)
            : [],
        inventoryRequests: mockData.inventoryRequests
            .filter(mockCanViewRequest)
            .map(mockBuildInventoryRequestDTO),
        programRequests: mockData.programRequests
            .filter(mockCanViewRequest)
            .map(mockBuildProgramRequestDTO),
        tickets: canUseTickets(mockToUserDTO(mockCurrentUser()))
            ? mockData.tickets.map(mockBuildTicketDTO)
            : [],
        links: mockData.links.filter((l) => l.Enabled),
        homeContent: mockData.homeContent,
        shiftPresets: [...mockData.shiftPresets].sort((a, b) => a.Name.localeCompare(b.Name)),
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
    updateDepartment: (id: string, input: CreateDepartmentInput) => {
        const department = mockData.departments.find((d) => d.Id === id);
        if (!department) throw new Error('not_found');
        department.Name = input.name;
        department.ShortName = input.shortName || '';
        return department;
    },
    deleteDepartment: (id: string) => {
        mockData.departments = mockData.departments.filter((d) => d.Id !== id);
    },

    listPlaces: () => mockData.places,
    createPlace: (input: CreatePlaceInput) => {
        const created: Place = { Id: mockUuid(), Name: input.name };
        mockData.places.push(created);
        return created;
    },
    updatePlace: (id: string, input: CreatePlaceInput) => {
        const place = mockData.places.find((p) => p.Id === id);
        if (!place) throw new Error('not_found');
        place.Name = input.name;
        return place;
    },
    deletePlace: (id: string) => {
        mockData.places = mockData.places.filter((p) => p.Id !== id);
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
    updateLink: (id: string, input: CreateLinkInput) => {
        const link = mockData.links.find((l) => l.Id === id);
        if (!link) throw new Error('not_found');
        link.Name = input.name;
        link.Url = input.url;
        link.Enabled = input.enabled !== false;
        return link;
    },
    deleteLink: (id: string) => {
        mockData.links = mockData.links.filter((l) => l.Id !== id);
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

    listShiftPresets: () => [...mockData.shiftPresets].sort((a, b) => a.Name.localeCompare(b.Name)),
    createShiftPreset: (input: CreateShiftPresetInput) => {
        const created: ShiftPreset = {
            Id: mockUuid(),
            Name: input.name,
            DefaultStartTime: input.defaultStartTime || '',
            DefaultEndTime: input.defaultEndTime || '',
        };
        mockData.shiftPresets.push(created);
        return created;
    },
    updateShiftPreset: (id: string, input: CreateShiftPresetInput) => {
        const preset = mockData.shiftPresets.find((p) => p.Id === id);
        if (!preset) throw new Error('not_found');
        preset.Name = input.name;
        preset.DefaultStartTime = input.defaultStartTime || '';
        preset.DefaultEndTime = input.defaultEndTime || '';
        return preset;
    },
    deleteShiftPreset: (id: string) => {
        mockData.shiftPresets = mockData.shiftPresets.filter((p) => p.Id !== id);
    },

    listRosters: (page: number) => {
        if (!canApprove(mockToUserDTO(mockCurrentUser()))) {
            throw new Error('Approver access is required.');
        }
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
    updateRoster: (id: string, input: CreateRosterInput) => {
        const roster = mockData.rosters.find((r) => r.Id === id);
        if (!roster) throw new Error('not_found');
        roster.StartDate = input.startDate;
        roster.EndDate = input.endDate;
        roster.StartTime = input.startTime || '';
        roster.EndTime = input.endTime || '';
        roster.Name = input.name;
        roster.UserId = input.userId;
        return mockBuildRosterDTO(roster);
    },
    deleteRoster: (id: string) => {
        mockData.rosters = mockData.rosters.filter((r) => r.Id !== id);
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
    updateInventoryType: (id: string, input: CreateInventoryTypeInput) => {
        const type = mockData.inventoryTypes.find((t) => t.Id === id);
        if (!type) throw new Error('not_found');
        type.Name = input.name;
        type.Description = input.description || '';
        type.Requestable = input.requestable !== false;
        type.TotalQuantity = input.totalQuantity;
        return mockBuildInventoryTypeDTOs().find((t) => t.Id === id);
    },
    deleteInventoryType: (id: string) => {
        mockData.inventoryTypes = mockData.inventoryTypes.filter((t) => t.Id !== id);
    },

    listInventoryRequests: (page: number, query: InventoryRequestQuery = {}) => {
        const items = mockData.inventoryRequests
            .filter(mockCanViewRequest)
            .map(mockBuildInventoryRequestDTO)
            .filter((request) => !query.statuses?.length || query.statuses.includes(request.Status))
            .filter(
                (request) =>
                    !query.inventoryTypeId ||
                    request.items.some((item) => item.InventoryTypeId === query.inventoryTypeId),
            )
            .filter((request) =>
                mockIncludes(query.q, [
                    `REQ-${request.DisplayId}`,
                    request.Name,
                    request.userName,
                    request.participants.join(' '),
                    request.items.map((item) => item.itemName).join(' '),
                ]),
            );
        const value = (request: InventoryRequestDTO): unknown => {
            if (query.sortBy === 'name') return request.Name;
            if (query.sortBy === 'status') return request.Status;
            if (query.sortBy === 'startDate') return request.StartDate;
            if (query.sortBy === 'endDate') return request.EndDate;
            if (query.sortBy === 'requester') return request.userName;
            return request.DisplayId;
        };
        items.sort((a, b) => mockCompare(value(a), value(b), query.sortDirection || 'desc'));
        return mockPaginate(items, page);
    },
    getInventoryRequest: (id: string) => {
        const request = mockData.inventoryRequests.find((item) => item.Id === id);
        if (!request || !mockCanViewRequest(request)) throw new Error('request_not_found');
        return mockBuildInventoryRequestDTO(request);
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

    listProgramRequests: (page: number, query: ProgramRequestQuery = {}) => {
        const items = mockData.programRequests
            .filter(mockCanViewRequest)
            .map(mockBuildProgramRequestDTO)
            .filter((request) => !query.statuses?.length || query.statuses.includes(request.Status))
            .filter((request) => !query.placeId || request.PlaceId === query.placeId)
            .filter((request) =>
                mockIncludes(query.q, [
                    `PRG-${request.DisplayId}`,
                    request.Name,
                    request.Type,
                    request.userName,
                    request.participants.join(' '),
                    request.placeName,
                    request.sessions.map((session) => `${session.Name} ${session.Type}`).join(' '),
                ]),
            );
        const value = (request: ProgramRequestDTO): unknown => {
            if (query.sortBy === 'name') return request.Name;
            if (query.sortBy === 'status') return request.Status;
            if (query.sortBy === 'place') return request.placeName;
            if (query.sortBy === 'sessionStart') return request.sessions[0]?.StartDateTime || '';
            if (query.sortBy === 'requester') return request.userName;
            return request.DisplayId;
        };
        items.sort((a, b) => mockCompare(value(a), value(b), query.sortDirection || 'desc'));
        return mockPaginate(items, page);
    },
    getProgramRequest: (id: string) => {
        const request = mockData.programRequests.find((item) => item.Id === id);
        if (!request || !mockCanViewRequest(request)) throw new Error('request_not_found');
        return mockBuildProgramRequestDTO(request);
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

    listTickets: (page: number, query: TicketQuery = {}) => {
        if (!canUseTickets(mockToUserDTO(mockCurrentUser()))) {
            throw new Error('Tickets are not available for your role.');
        }
        const items = mockData.tickets
            .map(mockBuildTicketDTO)
            .filter((ticket) => !query.statuses?.length || query.statuses.includes(ticket.Status))
            .filter((ticket) => {
                if (!query.assigneeId) return true;
                return query.assigneeId === '__unassigned__'
                    ? !ticket.AssigneeId
                    : ticket.AssigneeId === query.assigneeId;
            })
            .filter((ticket) =>
                mockIncludes(query.q, [
                    `TKT-${ticket.DisplayId}`,
                    ticket.Title,
                    ticket.Description,
                    ticket.assigneeName,
                ]),
            );
        const value = (ticket: TicketDTO): unknown => {
            if (query.sortBy === 'title') return ticket.Title;
            if (query.sortBy === 'status') return ticket.Status;
            if (query.sortBy === 'assignee') return ticket.assigneeName;
            return ticket.DisplayId;
        };
        items.sort((a, b) => mockCompare(value(a), value(b), query.sortDirection || 'desc'));
        return mockPaginate(items, page);
    },
    getTicket: (id: string) => {
        if (!canUseTickets(mockToUserDTO(mockCurrentUser()))) {
            throw new Error('Tickets are not available for your role.');
        }
        const ticket = mockData.tickets.find((item) => item.Id === id);
        if (!ticket) throw new Error('ticket_not_found');
        return mockBuildTicketDTO(ticket);
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

    uploadImage: (_base64Data: string, fileName: string) =>
        'mock-image-' + mockUuid() + '-' + fileName,
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

// Dev convenience: there's no sign-in to switch, so call
// `mockSignInAs('sam@example.com')` from the browser console to re-render
// the app as another mock user and check how each role sees it.
(window as any).mockSignInAs = function (email: string): void {
    if (!mockData.users.some((u) => u.Email === email)) {
        console.warn(
            'No mock user ' + email + '. Try: ' + mockData.users.map((u) => u.Email).join(', '),
        );
        return;
    }
    mockData.currentUserId = email;
    refreshDashboard();
};

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
