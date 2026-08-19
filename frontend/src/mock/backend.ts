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

function mockMinutesAgoIso(minutes: number): string {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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

type MockProgramFieldName = 'name' | 'language' | 'type' | 'departmentId' | 'leadEmail';
type MockSessionFieldName = 'type' | 'startDateTime' | 'endDateTime';
type MockLegacyInventoryItem = InventoryItem & { Id: string; RequestId: string };
type MockLegacyProgramSession = ProgramSession & { Id: string; RequestId: string };

const MOCK_PROGRAM_FIELD_LABELS: Record<MockProgramFieldName, string> = {
    name: 'Program title',
    language: 'Language',
    type: 'Program type',
    departmentId: 'Department',
    leadEmail: 'Lead email',
};

const MOCK_PROGRAM_FIELD_REQUIRED: Record<
    MockProgramFieldName,
    (input: CreateProgramRequestInput | UpdateProgramRequestInput) => boolean
> = {
    name: (input) => input.type === 'Other',
    language: () => true,
    type: () => true,
    departmentId: () => true,
    leadEmail: () => true,
};

const MOCK_SESSION_FIELD_LABELS: Record<MockSessionFieldName, string> = {
    type: 'Session type',
    startDateTime: 'Session start',
    endDateTime: 'Session end',
};

const MOCK_SESSION_FIELD_REQUIRED: Record<
    MockSessionFieldName,
    (input: ProgramSessionInput) => boolean
> = {
    type: () => true,
    startDateTime: () => true,
    endDateTime: () => true,
};

function mockInputValue(input: object, field: string): string {
    return String((input as unknown as Record<string, unknown>)[field] || '');
}

function mockCleanProgramField(
    input: CreateProgramRequestInput | UpdateProgramRequestInput,
    field: MockProgramFieldName,
): string {
    const value = mockInputValue(input, field);
    if (MOCK_PROGRAM_FIELD_REQUIRED[field](input) && !value.trim()) {
        throw new Error(MOCK_PROGRAM_FIELD_LABELS[field] + ' is required.');
    }
    return value;
}

function mockCleanSessionField(input: ProgramSessionInput, field: MockSessionFieldName): string {
    const value = mockInputValue(input, field);
    if (MOCK_SESSION_FIELD_REQUIRED[field](input) && !value.trim()) {
        throw new Error(MOCK_SESSION_FIELD_LABELS[field] + ' is required.');
    }
    return value;
}

function mockAssertPlaceAvailability(
    place: Place | undefined,
    sessions: ProgramSession[],
    currentRequestId?: string,
): void {
    if (!place || place.AllowOverlap || !sessions.length) return;
    const bufferMs = 60 * 60 * 1000;
    const conflict = mockData.programRequests
        .filter(
            (request) =>
                request.Id !== currentRequestId &&
                request.Status === 'approved' &&
                request.PlaceId === place.Id,
        )
        .some((request) =>
            mockParseProgramSessions(request.SessionsJson).some((other) =>
                sessions.some((session) => {
                    const leftStart = Date.parse(session.StartDateTime);
                    const leftEnd = Date.parse(session.EndDateTime);
                    const rightStart = Date.parse(other.StartDateTime);
                    const rightEnd = Date.parse(other.EndDateTime);
                    return leftStart < rightEnd + bufferMs && rightStart < leftEnd + bufferMs;
                }),
            ),
        );
    if (conflict) {
        throw new Error(
            'This place is unavailable: its session is within one hour of another scheduled program.',
        );
    }
}

function mockCleanProgramSessions(input: ProgramSessionInput[]): ProgramSession[] {
    if (!input || input.length === 0) throw new Error('At least one session is required.');
    return input.map((session) => {
        const type = mockCleanSessionField(session, 'type');
        const startDateTime = mockCleanSessionField(session, 'startDateTime');
        const endDateTime = mockCleanSessionField(session, 'endDateTime');
        const startMs = Date.parse(startDateTime);
        const endMs = Date.parse(endDateTime);
        if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
            throw new Error('Session end must be after its start.');
        }
        if (endMs - startMs >= 86400000) throw new Error('Sessions must be shorter than 24 hours.');
        return {
            Name: session.name || '',
            Type: type,
            StartDateTime: startDateTime,
            EndDateTime: endDateTime,
        };
    });
}

function mockInventoryItemsJson(items: InventoryItem[]): string {
    return JSON.stringify(
        items.map((item) => ({
            InventoryTypeId: item.InventoryTypeId,
            Quantity: item.Quantity,
            Condition: item.Condition || '',
        })),
    );
}

function mockProgramSessionsJson(sessions: ProgramSession[]): string {
    return JSON.stringify(
        sessions.map((session) => ({
            Name: session.Name || '',
            Type: session.Type,
            StartDateTime: session.StartDateTime,
            EndDateTime: session.EndDateTime,
        })),
    );
}

function mockParseInventoryItems(raw: string): InventoryItem[] {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? (parsed as InventoryItem[]) : [];
    } catch (err) {
        return [];
    }
}

function mockParseProgramSessions(raw: string): ProgramSession[] {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? (parsed as ProgramSession[]) : [];
    } catch (err) {
        return [];
    }
}

const EXTRA_APPROVED_PROGRAM_REQUESTS: ProgramRequest[] = [
    {
        Id: 'program-29',
        DisplayId: 29,
        Name: 'Approved studio program 1',
        Language: 'English',
        Type: 'Livestream',
        UserId: 'sam@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-1',
        DepartmentId: 'dep-1',
        LeadEmail: 'ana@example.com',
        Participants: 'ana@example.com',
        SessionsJson: '',
    },
    {
        Id: 'program-30',
        DisplayId: 30,
        Name: 'Approved studio program 2',
        Language: 'English',
        Type: 'Recording',
        UserId: 'ana@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-2',
        DepartmentId: 'dep-2',
        LeadEmail: 'admin@example.com',
        Participants: '',
        SessionsJson: '',
    },
    {
        Id: 'program-31',
        DisplayId: 31,
        Name: 'Approved studio program 3',
        Language: 'English',
        Type: 'Webinar',
        UserId: 'vic@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-3',
        DepartmentId: 'dep-3',
        LeadEmail: 'admin@example.com',
        Participants: 'ana@example.com',
        SessionsJson: '',
    },
    {
        Id: 'program-32',
        DisplayId: 32,
        Name: 'Approved studio program 4',
        Language: 'English',
        Type: 'Meeting',
        UserId: 'sam@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-4',
        DepartmentId: 'dep-4',
        LeadEmail: 'ana@example.com',
        Participants: '',
        SessionsJson: '',
    },
    {
        Id: 'program-33',
        DisplayId: 33,
        Name: 'Approved studio program 5',
        Language: 'English',
        Type: 'Visit',
        UserId: 'ana@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-5',
        DepartmentId: 'dep-5',
        LeadEmail: 'admin@example.com',
        Participants: 'ana@example.com',
        SessionsJson: '',
    },
    {
        Id: 'program-34',
        DisplayId: 34,
        Name: 'Approved studio program 6',
        Language: 'English',
        Type: 'Livestream',
        UserId: 'vic@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-6',
        DepartmentId: 'dep-6',
        LeadEmail: 'admin@example.com',
        Participants: '',
        SessionsJson: '',
    },
    {
        Id: 'program-35',
        DisplayId: 35,
        Name: 'Approved studio program 7',
        Language: 'English',
        Type: 'Recording',
        UserId: 'sam@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-1',
        DepartmentId: 'dep-1',
        LeadEmail: 'ana@example.com',
        Participants: 'ana@example.com',
        SessionsJson: '',
    },
    {
        Id: 'program-36',
        DisplayId: 36,
        Name: 'Approved studio program 8',
        Language: 'English',
        Type: 'Webinar',
        UserId: 'ana@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-2',
        DepartmentId: 'dep-2',
        LeadEmail: 'admin@example.com',
        Participants: '',
        SessionsJson: '',
    },
    {
        Id: 'program-37',
        DisplayId: 37,
        Name: 'Approved studio program 9',
        Language: 'English',
        Type: 'Meeting',
        UserId: 'vic@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-3',
        DepartmentId: 'dep-3',
        LeadEmail: 'admin@example.com',
        Participants: 'ana@example.com',
        SessionsJson: '',
    },
    {
        Id: 'program-38',
        DisplayId: 38,
        Name: 'Approved studio program 10',
        Language: 'English',
        Type: 'Visit',
        UserId: 'sam@example.com',
        Status: 'approved' as ProgramRequestStatus,
        PlaceId: 'place-4',
        DepartmentId: 'dep-4',
        LeadEmail: 'ana@example.com',
        Participants: '',
        SessionsJson: '',
    },
] as ProgramRequest[];

const EXTRA_APPROVED_PROGRAM_SESSIONS: MockLegacyProgramSession[] = [
    {
        Id: 'session-29',
        Name: 'Main session',
        Type: 'Live',
        RequestId: 'program-29',
        StartDateTime: mockAddDays(8) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(8) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-29-prep',
        Name: 'Prep session',
        Type: 'Dry Run',
        RequestId: 'program-29',
        StartDateTime: mockAddDays(8) + 'T07:30:00.000Z',
        EndDateTime: mockAddDays(8) + 'T08:30:00.000Z',
    },
    {
        Id: 'session-30',
        Name: 'Main session',
        Type: 'Recording',
        RequestId: 'program-30',
        StartDateTime: mockAddDays(9) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(9) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-31',
        Name: 'Main session',
        Type: 'Live',
        RequestId: 'program-31',
        StartDateTime: mockAddDays(10) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(10) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-32',
        Name: 'Main session',
        Type: 'Dry Run',
        RequestId: 'program-32',
        StartDateTime: mockAddDays(11) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(11) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-32-prep',
        Name: 'Prep session',
        Type: 'Dry Run',
        RequestId: 'program-32',
        StartDateTime: mockAddDays(11) + 'T07:30:00.000Z',
        EndDateTime: mockAddDays(11) + 'T08:30:00.000Z',
    },
    {
        Id: 'session-33',
        Name: 'Main session',
        Type: 'Recording',
        RequestId: 'program-33',
        StartDateTime: mockAddDays(12) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(12) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-34',
        Name: 'Main session',
        Type: 'Live',
        RequestId: 'program-34',
        StartDateTime: mockAddDays(13) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(13) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-35',
        Name: 'Main session',
        Type: 'Dry Run',
        RequestId: 'program-35',
        StartDateTime: mockAddDays(14) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(14) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-35-prep',
        Name: 'Prep session',
        Type: 'Dry Run',
        RequestId: 'program-35',
        StartDateTime: mockAddDays(14) + 'T07:30:00.000Z',
        EndDateTime: mockAddDays(14) + 'T08:30:00.000Z',
    },
    {
        Id: 'session-36',
        Name: 'Main session',
        Type: 'Recording',
        RequestId: 'program-36',
        StartDateTime: mockAddDays(15) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(15) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-37',
        Name: 'Main session',
        Type: 'Live',
        RequestId: 'program-37',
        StartDateTime: mockAddDays(16) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(16) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-38',
        Name: 'Main session',
        Type: 'Dry Run',
        RequestId: 'program-38',
        StartDateTime: mockAddDays(17) + 'T09:00:00.000Z',
        EndDateTime: mockAddDays(17) + 'T11:00:00.000Z',
    },
    {
        Id: 'session-38-prep',
        Name: 'Prep session',
        Type: 'Dry Run',
        RequestId: 'program-38',
        StartDateTime: mockAddDays(17) + 'T07:30:00.000Z',
        EndDateTime: mockAddDays(17) + 'T08:30:00.000Z',
    },
];

const mockData = {
    currentUserId: 'admin@example.com',
    users: [
        {
            Email: 'admin@example.com',
            Name: 'Alex Admin',
            Role: 'admin' as UserRole,
            DepartmentId: 'dep-1',
            Phone: '+919000000001',
            Whatsapp: '+919100000001',
        },
        {
            Email: 'ana@example.com',
            Name: 'Ana Approver',
            Role: 'approver' as UserRole,
            DepartmentId: 'dep-1',
            Phone: '+919000000002',
            Whatsapp: '+919100000002',
        },
        {
            Email: 'vic@example.com',
            Name: 'Vic Viewer',
            Role: 'viewer' as UserRole,
            DepartmentId: 'dep-1',
            Phone: '+919000000003',
            Whatsapp: '+919100000003',
        },
        {
            Email: 'sam@example.com',
            Name: 'Sam User',
            Role: 'user' as UserRole,
            DepartmentId: 'dep-1',
            Phone: '+919000000004',
            Whatsapp: '+919100000004',
        },
    ] as User[],
    departments: [
        { Id: 'dep-1', Name: 'Production', ShortName: 'PROD', LeadEmail: 'ana@example.com' },
        { Id: 'dep-2', Name: 'Post-Production', ShortName: 'POST', LeadEmail: 'ana@example.com' },
        { Id: 'dep-3', Name: 'Marketing', ShortName: 'MKTG', LeadEmail: 'vic@example.com' },
        { Id: 'dep-4', Name: 'Engineering', ShortName: 'ENG', LeadEmail: 'admin@example.com' },
        { Id: 'dep-5', Name: 'Operations', ShortName: 'OPS', LeadEmail: 'admin@example.com' },
        { Id: 'dep-6', Name: 'Finance', ShortName: 'FIN', LeadEmail: 'admin@example.com' },
    ] as Department[],
    places: [
        { Id: 'place-1', Name: 'Studio A', AllowOverlap: false },
        { Id: 'place-2', Name: 'Studio B', AllowOverlap: false },
        { Id: 'place-3', Name: 'Studio C', AllowOverlap: false },
        { Id: 'place-4', Name: 'Edit Suite 1', AllowOverlap: false },
        { Id: 'place-5', Name: 'Podcast Room', AllowOverlap: false },
        { Id: 'place-6', Name: 'Green Room', AllowOverlap: false },
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
            ImageId: '',
            DepartmentId: 'dep-1',
            LeadEmail: 'ana@example.com',
            Participants: '',
            ItemsJson: '',
        },
        {
            Id: 'req-2',
            DisplayId: 2,
            Name: 'Evening satsang audio',
            UserId: 'ana@example.com',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(2),
            Status: 'approved' as InventoryRequestStatus,
            ImageId: '',
            DepartmentId: 'dep-1',
            LeadEmail: 'ana@example.com',
            Participants: 'sam@example.com',
            ItemsJson: '',
        },
        {
            Id: 'req-3',
            DisplayId: 3,
            Name: 'Temple livestream kit',
            UserId: 'vic@example.com',
            StartDate: mockAddDays(-5),
            EndDate: mockAddDays(-2),
            Status: 'issued' as InventoryRequestStatus,
            ImageId: '',
            DepartmentId: 'dep-3',
            LeadEmail: 'vic@example.com',
            Participants: '',
            ItemsJson: '',
        },
        {
            Id: 'req-4',
            DisplayId: 4,
            Name: 'Guest interview setup',
            UserId: 'sam@example.com',
            StartDate: mockAddDays(-7),
            EndDate: mockAddDays(-6),
            Status: 'issued' as InventoryRequestStatus,
            ImageId: '',
            DepartmentId: 'dep-1',
            LeadEmail: 'ana@example.com',
            Participants: '',
            ItemsJson: '',
        },
        {
            Id: 'req-5',
            DisplayId: 5,
            Name: 'Podcast room recording',
            UserId: 'ana@example.com',
            StartDate: mockAddDays(-12),
            EndDate: mockAddDays(-11),
            Status: 'closed' as InventoryRequestStatus,
            ImageId: '',
            DepartmentId: 'dep-1',
            LeadEmail: 'ana@example.com',
            Participants: '',
            ItemsJson: '',
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
            Condition: 'returned' as ReturnCondition,
        },
        {
            Id: 'reqitem-5',
            RequestId: 'req-5',
            InventoryTypeId: 'inv-2',
            Quantity: 1,
            Condition: 'returned' as ReturnCondition,
        },
    ] as MockLegacyInventoryItem[],
    programRequests: [
        {
            Id: 'program-1',
            DisplayId: 21,
            Name: 'Sunday Satsang',
            Language: 'English',
            Type: 'Livestream',
            UserId: 'sam@example.com',
            Status: 'submitted' as ProgramRequestStatus,
            PlaceId: 'place-1',
            DepartmentId: 'dep-1',
            LeadEmail: 'ana@example.com',
            Participants: 'ana@example.com',
            SessionsJson: '',
        },
        {
            Id: 'program-2',
            DisplayId: 22,
            Name: 'Podcast recording',
            Language: 'English',
            Type: 'Recording',
            UserId: 'ana@example.com',
            Status: 'approved' as ProgramRequestStatus,
            PlaceId: 'place-5',
            DepartmentId: 'dep-1',
            LeadEmail: 'ana@example.com',
            Participants: '',
            SessionsJson: '',
        },
        {
            Id: 'program-3',
            DisplayId: 23,
            Name: 'Volunteer orientation',
            Language: 'English',
            Type: 'Webinar',
            UserId: 'vic@example.com',
            Status: 'draft' as ProgramRequestStatus,
            PlaceId: 'place-2',
            DepartmentId: 'dep-3',
            LeadEmail: 'vic@example.com',
            Participants: '',
            SessionsJson: '',
        },
        {
            Id: 'program-4',
            DisplayId: 24,
            Name: 'Festival rehearsal',
            Language: 'English',
            Type: 'Webinar',
            UserId: 'admin@example.com',
            Status: 'cancelled' as ProgramRequestStatus,
            PlaceId: 'place-3',
            DepartmentId: 'dep-4',
            LeadEmail: 'admin@example.com',
            Participants: '',
            SessionsJson: '',
        },
        {
            Id: 'program-5',
            DisplayId: 25,
            Name: 'Monthly review',
            Language: 'English',
            Type: 'Meeting',
            UserId: 'admin@example.com',
            Status: 'cancelled' as ProgramRequestStatus,
            PlaceId: 'place-4',
            DepartmentId: 'dep-4',
            LeadEmail: 'admin@example.com',
            Participants: '',
            SessionsJson: '',
        },
        {
            Id: 'program-6',
            DisplayId: 26,
            Name: 'Studio tour request',
            Language: 'English',
            Type: 'Visit',
            UserId: 'sam@example.com',
            Status: 'rejected' as ProgramRequestStatus,
            PlaceId: 'place-1',
            DepartmentId: 'dep-1',
            LeadEmail: 'ana@example.com',
            Participants: '',
            SessionsJson: '',
        },
        {
            Id: 'program-7',
            DisplayId: 27,
            Name: 'Training archive recording',
            Language: 'English',
            Type: 'Recording',
            UserId: 'ana@example.com',
            Status: 'approved' as ProgramRequestStatus,
            PlaceId: 'place-4',
            DepartmentId: 'dep-2',
            LeadEmail: 'ana@example.com',
            Participants: 'sam@example.com',
            SessionsJson: '',
        },
        {
            Id: 'program-8',
            DisplayId: 28,
            Name: 'Evening music session',
            Language: 'English',
            Type: 'Livestream',
            UserId: 'vic@example.com',
            Status: 'approved' as ProgramRequestStatus,
            PlaceId: 'place-3',
            DepartmentId: 'dep-3',
            LeadEmail: 'vic@example.com',
            Participants: '',
            SessionsJson: '',
        },
        ...EXTRA_APPROVED_PROGRAM_REQUESTS,
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
            Type: 'Dry Run',
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
            Name: 'Mic check',
            Type: 'Dry Run',
            RequestId: 'program-2',
            StartDateTime: mockAddDays(4) + 'T08:15:00.000Z',
            EndDateTime: mockAddDays(4) + 'T08:45:00.000Z',
        },
        {
            Id: 'session-5',
            Name: 'Orientation',
            Type: 'Live',
            RequestId: 'program-3',
            StartDateTime: mockAddDays(6) + 'T12:00:00.000Z',
            EndDateTime: mockAddDays(6) + 'T13:30:00.000Z',
        },
        {
            Id: 'session-6',
            Name: 'Q&A circle',
            Type: 'Live',
            RequestId: 'program-3',
            StartDateTime: mockAddDays(6) + 'T14:00:00.000Z',
            EndDateTime: mockAddDays(6) + 'T15:00:00.000Z',
        },
        {
            Id: 'session-7',
            Name: 'Rehearsal',
            Type: 'Dry Run',
            RequestId: 'program-4',
            StartDateTime: mockAddDays(1) + 'T14:00:00.000Z',
            EndDateTime: mockAddDays(1) + 'T16:00:00.000Z',
        },
        {
            Id: 'session-8',
            Name: 'Review',
            Type: 'Live',
            RequestId: 'program-5',
            StartDateTime: mockAddDays(-2) + 'T10:00:00.000Z',
            EndDateTime: mockAddDays(-2) + 'T11:00:00.000Z',
        },
        {
            Id: 'session-9',
            Name: 'Walkthrough',
            Type: 'Live',
            RequestId: 'program-6',
            StartDateTime: mockAddDays(3) + 'T11:00:00.000Z',
            EndDateTime: mockAddDays(3) + 'T12:00:00.000Z',
        },
        {
            Id: 'session-10',
            Name: 'Archive capture',
            Type: 'Recording',
            RequestId: 'program-7',
            StartDateTime: mockAddDays(5) + 'T08:00:00.000Z',
            EndDateTime: mockAddDays(5) + 'T10:30:00.000Z',
        },
        {
            Id: 'session-11',
            Name: 'Edit notes review',
            Type: 'Live',
            RequestId: 'program-7',
            StartDateTime: mockAddDays(5) + 'T11:00:00.000Z',
            EndDateTime: mockAddDays(5) + 'T11:45:00.000Z',
        },
        {
            Id: 'session-12',
            Name: 'Main session',
            Type: 'Live',
            RequestId: 'program-8',
            StartDateTime: mockAddDays(7) + 'T13:30:00.000Z',
            EndDateTime: mockAddDays(7) + 'T15:00:00.000Z',
        },
        {
            Id: 'session-13',
            Name: 'Stage setup',
            Type: 'Dry Run',
            RequestId: 'program-8',
            StartDateTime: mockAddDays(7) + 'T12:30:00.000Z',
            EndDateTime: mockAddDays(7) + 'T13:15:00.000Z',
        },
        {
            // Runs at the same time as program-7's archive capture, but in
            // Studio C rather than Edit Suite 1.
            Id: 'session-14',
            Name: 'Parallel studio session',
            Type: 'Live',
            RequestId: 'program-8',
            StartDateTime: mockAddDays(5) + 'T08:00:00.000Z',
            EndDateTime: mockAddDays(5) + 'T10:30:00.000Z',
        },
        {
            Id: 'session-15',
            Name: 'Archive capture',
            Type: 'Recording',
            RequestId: 'program-7',
            StartDateTime: mockAddDays(7) + 'T08:00:00.000Z',
            EndDateTime: mockAddDays(7) + 'T10:30:00.000Z',
        },
        {
            Id: 'session-16',
            Name: 'Parallel studio session',
            Type: 'Live',
            RequestId: 'program-8',
            StartDateTime: mockAddDays(7) + 'T08:00:00.000Z',
            EndDateTime: mockAddDays(7) + 'T10:30:00.000Z',
        },
        {
            Id: 'session-17',
            Name: 'Archive capture',
            Type: 'Recording',
            RequestId: 'program-7',
            StartDateTime: mockAddDays(9) + 'T08:00:00.000Z',
            EndDateTime: mockAddDays(9) + 'T10:30:00.000Z',
        },
        {
            Id: 'session-18',
            Name: 'Parallel studio session',
            Type: 'Live',
            RequestId: 'program-8',
            StartDateTime: mockAddDays(9) + 'T08:00:00.000Z',
            EndDateTime: mockAddDays(9) + 'T10:30:00.000Z',
        },
        ...EXTRA_APPROVED_PROGRAM_SESSIONS,
    ] as MockLegacyProgramSession[],
    rosters: [
        {
            // Same name/time as roster-2 below, but assigned to a different
            // volunteer. The two-day range also overlaps roster-4 for Sam on
            // the second day. Times match the Morning shift type.
            Id: 'roster-1',
            Name: 'Morning',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(2),
            StartTime: '04:00',
            EndTime: '13:30',
            UserId: 'sam@example.com',
        },
        {
            Id: 'roster-2',
            Name: 'Morning',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(2),
            StartTime: '04:00',
            EndTime: '13:30',
            UserId: 'ana@example.com',
        },
        {
            // Multi-day range - appears on the calendar every day from
            // start to end. Times match the Evening shift type.
            Id: 'roster-3',
            Name: 'Evening',
            StartDate: mockAddDays(1),
            EndDate: mockAddDays(3),
            StartTime: '13:30',
            EndTime: '22:00',
            UserId: 'vic@example.com',
        },
        {
            // Times match the Night shift type. This overlaps roster-1 for
            // Sam on mockAddDays(2), forcing a second volunteer lane.
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
            // all-day 00:00-24:00 block, matching the Day shift type
            // (also always full-day). This spans two dates for Ana.
            Id: 'roster-5',
            Name: 'Day',
            StartDate: mockAddDays(4),
            EndDate: mockAddDays(5),
            StartTime: '',
            EndTime: '',
            UserId: 'ana@example.com',
        },
        {
            // Custom name (not a preset) with its end time left blank -
            // defaults to 24:00. This spans three dates for Vic and overlaps
            // roster-7 on its final two dates.
            Id: 'roster-6',
            Name: 'Overnight standby',
            StartDate: mockAddDays(5),
            EndDate: mockAddDays(7),
            StartTime: '20:00',
            EndTime: '',
            UserId: 'vic@example.com',
        },
        {
            // Same volunteer and overlapping dates as roster-6, so Vic gets
            // two lanes in the compact table.
            Id: 'roster-7',
            Name: 'Event setup',
            StartDate: mockAddDays(6),
            EndDate: mockAddDays(7),
            StartTime: '10:00',
            EndTime: '18:00',
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
            Timestamp: mockMinutesAgoIso(12),
            RequestId: 'req-1',
            UserId: 'sam@example.com',
            Message: 'Sam User submitted this request.',
        },
        {
            Id: 'comment-2',
            Timestamp: mockMinutesAgoIso(48),
            RequestId: 'req-2',
            UserId: 'admin@example.com',
            Message: 'Alex Admin approved this request.',
        },
        {
            Id: 'comment-3',
            Timestamp: mockMinutesAgoIso(95),
            RequestId: 'req-3',
            UserId: 'admin@example.com',
            Message: 'Alex Admin issued this equipment.',
        },
        {
            Id: 'comment-4',
            Timestamp: mockMinutesAgoIso(180),
            RequestId: 'req-4',
            UserId: 'admin@example.com',
            Message: 'Alex Admin recorded the equipment condition.',
        },
        {
            Id: 'comment-5',
            Timestamp: mockMinutesAgoIso(360),
            RequestId: 'req-5',
            UserId: 'admin@example.com',
            Message: 'Alex Admin closed this request.',
        },
        {
            Id: 'comment-6',
            Timestamp: mockMinutesAgoIso(720),
            RequestId: 'ticket-2',
            UserId: 'ana@example.com',
            Message: 'Ana Approver assigned this ticket to Ana Approver.',
        },
    ] as CommentRecord[],
    homeContent: {
        Guidelines:
            '## Quick guidelines\n\nPlease return equipment within 24 hours of your shoot ending.\n\n- Check the [inventory list](/?section=inventory) before requesting equipment.\n- Add a clear description and expected return time to each request.\n- Report damage promptly through the [tickets section](/?section=tickets).',
    } as HomeContent,
    shiftTypes: [
        {
            Id: 'shift-type-1',
            Name: 'Morning',
            Color: '#8bb8e8',
            DefaultStartTime: '04:00',
            DefaultEndTime: '13:30',
        },
        {
            Id: 'shift-type-2',
            Name: 'Evening',
            Color: '#f2ad72',
            DefaultStartTime: '13:30',
            DefaultEndTime: '22:00',
        },
        {
            Id: 'shift-type-3',
            Name: 'Night',
            Color: '#b7bec8',
            DefaultStartTime: '22:00',
            DefaultEndTime: '04:00',
        },
        // Blank times mean the full day - see the Roster.StartTime/EndTime
        // comment in shared/types.d.ts and isAllDayShiftBlock in roster.ts.
        { Id: 'shift-type-4', Name: 'Day', Color: '', DefaultStartTime: '', DefaultEndTime: '' },
        {
            Id: 'shift-type-5',
            Name: 'Vacation',
            Color: '',
            DefaultStartTime: '',
            DefaultEndTime: '',
        },
    ] as ShiftType[],
    programTypes: [
        { Id: 'program-type-livestream', Name: 'Livestream', Color: '#8bb8e8' },
        { Id: 'program-type-recording', Name: 'Recording', Color: '#f2ad72' },
        { Id: 'program-type-webinar', Name: 'Webinar', Color: '#f0d36b' },
        { Id: 'program-type-meeting', Name: 'Meeting', Color: '#b7bec8' },
        { Id: 'program-type-visit', Name: 'Visit', Color: '#8ac7a0' },
    ] as ProgramType[],
    programLanguages: [
        { Id: 'program-language-english', Name: 'English' },
        { Id: 'program-language-hindi', Name: 'Hindi' },
        { Id: 'program-language-tamil', Name: 'Tamil' },
        { Id: 'program-language-telugu', Name: 'Telugu' },
        { Id: 'program-language-kannada', Name: 'Kannada' },
    ] as ProgramLanguage[],
    sessionTypes: [
        { Id: 'session-type-live', Name: 'Live' },
        { Id: 'session-type-dry-run', Name: 'Dry Run' },
        { Id: 'session-type-recording', Name: 'Recording' },
    ] as SessionType[],
    blocks: [
        {
            Id: 'block-1',
            Name: 'Global maintenance',
            StartDateTime: mockAddDays(10) + 'T09:00:00.000Z',
            EndDateTime: mockAddDays(10) + 'T12:00:00.000Z',
            Place: '',
        },
    ] as Block[],
    nextDisplayId: { inventory_request: 6, program_request: 39, ticket: 2 },
};

mockData.inventoryRequests.forEach((request) => {
    request.ItemsJson = mockInventoryItemsJson(
        mockData.inventoryItems
            .filter((item) => item.RequestId === request.Id)
            .map((item) => ({
                InventoryTypeId: item.InventoryTypeId,
                Quantity: item.Quantity,
                Condition: item.Condition,
            })),
    );
});

mockData.programRequests.forEach((request) => {
    request.SessionsJson = mockProgramSessionsJson(
        mockData.sessions
            .filter((session) => session.RequestId === request.Id)
            .map((session) => ({
                Name: session.Name,
                Type: session.Type,
                StartDateTime: session.StartDateTime,
                EndDateTime: session.EndDateTime,
            })),
    );
});

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
    mockData.inventoryRequests.forEach((request) => {
        if (request.Status !== 'issued') return;
        mockParseInventoryItems(request.ItemsJson).forEach((item) => {
            deductions[item.InventoryTypeId] =
                (deductions[item.InventoryTypeId] || 0) + item.Quantity;
        });
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
        .filter((c) => c.RequestId === requestId)
        .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp))
        .map(mockBuildCommentDTO);
}

function mockInsertActionComment(
    _kind: 'inventory' | 'program' | 'ticket',
    requestId: string,
    actorId: string,
    message: string,
): CommentRecord {
    const created: CommentRecord = {
        Id: mockUuid(),
        Timestamp: mockNowIso(),
        RequestId: requestId,
        UserId: actorId,
        Message: message,
    };
    mockData.comments.push(created);
    return created;
}

function mockBuildInventoryRequestDTO(request: InventoryRequest): InventoryRequestDTO {
    const requester = mockData.users.find((u) => u.Email === request.UserId);
    const department = mockData.departments.find((d) => d.Id === request.DepartmentId);
    const items = mockParseInventoryItems(request.ItemsJson).map((i) => {
        const type = mockData.inventoryTypes.find((t) => t.Id === i.InventoryTypeId);
        return Object.assign({}, i, { itemName: type ? type.Name : '' });
    });
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        departmentName: department ? department.Name : '',
        participants: mockParseParticipants(request.Participants),
        items,
        comments: mockCommentsForRequest(request.Id),
    });
}

function mockBuildProgramRequestDTO(request: ProgramRequest): ProgramRequestDTO {
    const requester = mockData.users.find((u) => u.Email === request.UserId);
    const place = mockData.places.find((p) => p.Id === request.PlaceId);
    const department = mockData.departments.find((d) => d.Id === request.DepartmentId);
    const sessions = mockParseProgramSessions(request.SessionsJson).sort((a, b) =>
        a.StartDateTime.localeCompare(b.StartDateTime),
    );
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        placeName: place ? place.Name : '',
        departmentName: department ? department.Name : '',
        participants: mockParseParticipants(request.Participants),
        sessions,
        comments: mockCommentsForRequest(request.Id),
    });
}

function mockBuildTicketDTO(ticket: Ticket): TicketDTO {
    const assignee = mockData.users.find((u) => u.Email === ticket.AssigneeId);
    return Object.assign({}, ticket, {
        assigneeName: assignee ? assignee.Name : '',
        comments: mockCommentsForRequest(ticket.Id),
    });
}

function mockIncludes(query: string | undefined, values: unknown[]): boolean {
    const needles = String(query || '')
        .trim()
        .toLocaleLowerCase();
    if (!needles) return true;
    return needles.split(/\s+/).every((needle) =>
        values.some((value) =>
            String(value || '')
                .toLocaleLowerCase()
                .includes(needle),
        ),
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
        users: canApprove(mockToUserDTO(mockCurrentUser()))
            ? mockData.users.map(mockToUserDTO)
            : [],
        departments: mockData.departments,
        places: mockData.places,
        inventoryTypes: mockBuildInventoryTypeDTOs(),
        upcomingRosters: canApprove(mockToUserDTO(mockCurrentUser()))
            ? mockData.rosters.map(mockBuildRosterDTO)
            : [],
        inventoryRequests: mockData.inventoryRequests
            .filter(mockCanViewRequest)
            .filter((request) => ['closed', 'rejected', 'cancelled'].indexOf(request.Status) === -1)
            .map(mockBuildInventoryRequestDTO),
        programRequests: mockData.programRequests
            .filter(mockCanViewRequest)
            .map(mockBuildProgramRequestDTO),
        tickets: canUseTickets(mockToUserDTO(mockCurrentUser()))
            ? mockData.tickets.map(mockBuildTicketDTO)
            : [],
        recentComments: mockData.comments
            .filter((comment) => {
                const age = Date.now() - Date.parse(comment.Timestamp);
                return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
            })
            .map((comment) =>
                Object.assign(mockBuildCommentDTO(comment), {
                    requestKind: (comment.RequestId.startsWith('req-')
                        ? 'inventory'
                        : comment.RequestId.startsWith('ticket-')
                          ? 'ticket'
                          : 'program') as RecentCommentDTO['requestKind'],
                }),
            )
            .sort((a, b) => b.Timestamp.localeCompare(a.Timestamp)),
        homeContent: mockData.homeContent,
        shiftTypes: [...mockData.shiftTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
        programTypes: [...mockData.programTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
        programLanguages: [...mockData.programLanguages].sort((a, b) =>
            a.Name.localeCompare(b.Name),
        ),
        sessionTypes: [...mockData.sessionTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
        blocks: [...mockData.blocks].sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime)),
        failedEmailCount: 0,
    };
}

const mockHandlers: Record<string, (...args: any[]) => any> = {
    whoAmI: () => mockToUserDTO(mockCurrentUser()),
    getDashboard: () => mockBuildDashboard(),

    listUsers: () => mockData.users.map(mockToUserDTO),
    createUser: (input: CreateUserInput) => {
        const email = String(input.email || '')
            .trim()
            .toLowerCase();
        if (mockData.users.find((u) => u.Email === email)) throw new Error('User already exists.');
        const created: User = {
            Email: email,
            Name: input.name,
            Role: input.role,
            DepartmentId: input.departmentId || '',
            Phone: input.phone || '',
            Whatsapp: input.whatsapp || '',
        };
        mockData.users.push(created);
        return mockToUserDTO(created);
    },
    updateUser: (userId: string, patch: UpdateUserInput) => {
        const user = mockData.users.find((u) => u.Email === userId)!;
        if (patch.name !== undefined) user.Name = patch.name;
        if (patch.role !== undefined) user.Role = patch.role;
        if (patch.departmentId !== undefined) user.DepartmentId = patch.departmentId;
        if (patch.phone !== undefined) user.Phone = patch.phone;
        if (patch.whatsapp !== undefined) user.Whatsapp = patch.whatsapp;
        return mockToUserDTO(user);
    },
    deleteUser: (userId: string) => {
        const index = mockData.users.findIndex((u) => u.Email === userId);
        if (index !== -1) mockData.users.splice(index, 1);
    },
    updateOwnProfile: (patch: UpdateOwnProfileInput) => {
        const user = mockCurrentUser();
        if (patch.name !== undefined) user.Name = patch.name;
        if (patch.departmentId !== undefined) user.DepartmentId = patch.departmentId;
        if (patch.phone !== undefined) user.Phone = patch.phone;
        if (patch.whatsapp !== undefined) user.Whatsapp = patch.whatsapp;
        return mockToUserDTO(user);
    },

    listDepartments: () => mockData.departments,
    createDepartment: (input: CreateDepartmentInput) => {
        const created: Department = {
            Id: mockUuid(),
            Name: input.name,
            ShortName: input.shortName || '',
            LeadEmail: input.leadEmail || '',
        };
        mockData.departments.push(created);
        return created;
    },
    updateDepartment: (id: string, input: CreateDepartmentInput) => {
        const department = mockData.departments.find((d) => d.Id === id);
        if (!department) throw new Error('not_found');
        department.Name = input.name;
        department.ShortName = input.shortName || '';
        department.LeadEmail = input.leadEmail || '';
        return department;
    },
    deleteDepartment: (id: string) => {
        mockData.departments = mockData.departments.filter((d) => d.Id !== id);
    },

    listPlaces: () => mockData.places,
    createPlace: (input: CreatePlaceInput) => {
        const created: Place = {
            Id: mockUuid(),
            Name: input.name,
            AllowOverlap: input.allowOverlap,
        };
        mockData.places.push(created);
        return created;
    },
    updatePlace: (id: string, input: CreatePlaceInput) => {
        const place = mockData.places.find((p) => p.Id === id);
        if (!place) throw new Error('not_found');
        place.Name = input.name;
        place.AllowOverlap = input.allowOverlap;
        return place;
    },
    deletePlace: (id: string) => {
        mockData.places = mockData.places.filter((p) => p.Id !== id);
    },

    getHomeContent: () => mockData.homeContent,
    updateHomeContent: (input: UpdateHomeContentInput) => {
        mockData.homeContent = {
            Guidelines: input.guidelines || '',
        };
        return mockData.homeContent;
    },

    getSettings: () => ({
        guidelines: mockData.homeContent.Guidelines,
        shiftTypes: [...mockData.shiftTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
        programTypes: [...mockData.programTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
        programLanguages: [...mockData.programLanguages].sort((a, b) =>
            a.Name.localeCompare(b.Name),
        ),
        sessionTypes: [...mockData.sessionTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
    }),
    createShiftType: (input: CreateShiftTypeInput) => {
        const created: ShiftType = {
            Id: mockUuid(),
            Name: input.name,
            Color: input.color || '',
            DefaultStartTime: input.defaultStartTime || '',
            DefaultEndTime: input.defaultEndTime || '',
        };
        mockData.shiftTypes.push(created);
        return created;
    },
    updateShiftType: (id: string, input: CreateShiftTypeInput) => {
        const shiftType = mockData.shiftTypes.find((item) => item.Id === id);
        if (!shiftType) throw new Error('not_found');
        shiftType.Name = input.name;
        shiftType.Color = input.color || '';
        shiftType.DefaultStartTime = input.defaultStartTime || '';
        shiftType.DefaultEndTime = input.defaultEndTime || '';
        return shiftType;
    },
    deleteShiftType: (id: string) => {
        mockData.shiftTypes = mockData.shiftTypes.filter((item) => item.Id !== id);
    },

    listProgramTypes: () => [...mockData.programTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
    createProgramType: (input: CreateNamedOptionInput) => {
        const created: ProgramType = { Id: mockUuid(), Name: input.name, Color: input.color || '' };
        mockData.programTypes.push(created);
        return created;
    },
    updateProgramType: (id: string, input: CreateNamedOptionInput) => {
        const option = mockData.programTypes.find((item) => item.Id === id);
        if (!option) throw new Error('not_found');
        option.Name = input.name;
        option.Color = input.color || '';
        return option;
    },
    deleteProgramType: (id: string) => {
        mockData.programTypes = mockData.programTypes.filter((item) => item.Id !== id);
    },

    listProgramLanguages: () =>
        [...mockData.programLanguages].sort((a, b) => a.Name.localeCompare(b.Name)),
    createProgramLanguage: (input: CreateNamedOptionInput) => {
        const created: ProgramLanguage = { Id: mockUuid(), Name: input.name };
        mockData.programLanguages.push(created);
        return created;
    },
    updateProgramLanguage: (id: string, input: CreateNamedOptionInput) => {
        const option = mockData.programLanguages.find((item) => item.Id === id);
        if (!option) throw new Error('not_found');
        option.Name = input.name;
        return option;
    },
    deleteProgramLanguage: (id: string) => {
        mockData.programLanguages = mockData.programLanguages.filter((item) => item.Id !== id);
    },

    listSessionTypes: () => [...mockData.sessionTypes].sort((a, b) => a.Name.localeCompare(b.Name)),
    createSessionType: (input: CreateNamedOptionInput) => {
        const created: SessionType = { Id: mockUuid(), Name: input.name };
        mockData.sessionTypes.push(created);
        return created;
    },
    updateSessionType: (id: string, input: CreateNamedOptionInput) => {
        const option = mockData.sessionTypes.find((item) => item.Id === id);
        if (!option) throw new Error('not_found');
        option.Name = input.name;
        return option;
    },
    deleteSessionType: (id: string) => {
        mockData.sessionTypes = mockData.sessionTypes.filter((item) => item.Id !== id);
    },

    listBlocks: () =>
        [...mockData.blocks].sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime)),
    createBlock: (input: CreateBlockInput) => {
        const created: Block = {
            Id: mockUuid(),
            Name: input.name,
            StartDateTime: input.startDateTime,
            EndDateTime: input.endDateTime,
            Place: input.place || '',
        };
        mockData.blocks.push(created);
        return created;
    },
    updateBlock: (id: string, input: CreateBlockInput) => {
        const block = mockData.blocks.find((item) => item.Id === id);
        if (!block) throw new Error('not_found');
        block.Name = input.name;
        block.StartDateTime = input.startDateTime;
        block.EndDateTime = input.endDateTime;
        block.Place = input.place || '';
        return block;
    },
    deleteBlock: (id: string) => {
        mockData.blocks = mockData.blocks.filter((item) => item.Id !== id);
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
            ImageId: input.imageId || '',
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
        type.ImageId = input.imageId === undefined ? type.ImageId : input.imageId;
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
        const actor = mockCurrentUser();
        const requestedBy =
            mockData.users.find(
                (user) => user.Email === (input.userId || mockData.currentUserId),
            ) || actor;
        if (requestedBy.Email !== mockData.currentUserId && !canApprove(mockToUserDTO(actor))) {
            throw new Error('requester_edit_not_allowed');
        }
        const created: InventoryRequest = {
            Id: mockUuid(),
            DisplayId: mockData.nextDisplayId.inventory_request++,
            Name: input.name,
            UserId: requestedBy.Email,
            StartDate: input.startDate,
            EndDate: input.endDate,
            Status: 'draft',
            ImageId: input.imageId || '',
            DepartmentId: input.departmentId,
            LeadEmail: input.leadEmail,
            Participants: participants.join(', '),
            ItemsJson: mockInventoryItemsJson(
                input.items.map((line) => ({
                    InventoryTypeId: line.inventoryTypeId,
                    Quantity: line.quantity,
                    Condition: line.condition || '',
                })),
            ),
        };
        mockData.inventoryRequests.push(created);
        return mockBuildInventoryRequestDTO(created);
    },
    updateInventoryRequest: (id: string, input: UpdateInventoryRequestInput) => {
        const request = mockData.inventoryRequests.find((item) => item.Id === id);
        if (!request) throw new Error('request_not_found');
        const actor = mockCurrentUser();
        const isOwner =
            request.UserId === mockData.currentUserId ||
            mockParseParticipants(request.Participants).includes(mockData.currentUserId);
        if (!(canApprove(mockToUserDTO(actor)) || (isOwner && request.Status === 'draft'))) {
            throw new Error('edit_not_allowed');
        }
        const requestedBy = mockData.users.find((user) => user.Email === input.userId);
        if (!requestedBy) throw new Error('requester_not_found');
        if (request.UserId !== requestedBy.Email && !canApprove(mockToUserDTO(actor))) {
            throw new Error('requester_edit_not_allowed');
        }
        request.Name = input.name;
        request.UserId = requestedBy.Email;
        request.StartDate = input.startDate;
        request.EndDate = input.endDate;
        request.DepartmentId = input.departmentId;
        request.LeadEmail = input.leadEmail;
        request.Participants = mockParseParticipants(input.participants).join(', ');
        if (input.imageId !== undefined) request.ImageId = input.imageId;
        request.ItemsJson = mockInventoryItemsJson(
            input.items.map((line) => ({
                InventoryTypeId: line.inventoryTypeId,
                Quantity: line.quantity,
                Condition: line.condition || '',
            })),
        );
        return mockBuildInventoryRequestDTO(request);
    },
    updateInventoryRequestParticipants: (id: string, input: UpdateRequestParticipantsInput) => {
        const request = mockData.inventoryRequests.find((item) => item.Id === id);
        if (!request) throw new Error('request_not_found');
        const actor = mockCurrentUser();
        const isOwner =
            request.UserId === mockData.currentUserId ||
            mockParseParticipants(request.Participants).includes(mockData.currentUserId);
        if (!(canApprove(mockToUserDTO(actor)) || isOwner)) {
            throw new Error('participants_edit_not_allowed');
        }
        request.Participants = mockParseParticipants(input.participants).join(', ');
        return mockBuildInventoryRequestDTO(request);
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
            if (mockParseInventoryItems(request.ItemsJson).length === 0) {
                throw new Error('At least one item is required.');
            }
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
        } else if (action === 'cancel') {
            request.Status = 'cancelled';
            mockInsertActionComment(
                'inventory',
                requestId,
                actorId,
                actorName + ' cancelled this request. ' + note,
            );
        } else if (action === 'close') {
            if (request.Status === 'issued') {
                const items = mockParseInventoryItems(request.ItemsJson);
                if (!items.length || items.some((item) => !item.Condition)) {
                    throw new Error('all_items_need_conditions');
                }
            }
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
            .filter((request) => {
                if (!query.dateScope) return true;
                const nowIso = new Date().toISOString();
                const hasOngoingOrFutureSession = request.sessions.some(
                    (session) => session.EndDateTime >= nowIso,
                );
                return query.dateScope === 'past'
                    ? !hasOngoingOrFutureSession
                    : hasOngoingOrFutureSession;
            })
            .filter((request) =>
                mockIncludes(query.q, [
                    `PRG-${request.DisplayId}`,
                    request.Name,
                    request.Language,
                    request.Type,
                    request.userName,
                    request.UserId,
                    request.departmentName,
                    mockData.departments.find(
                        (department) => department.Id === request.DepartmentId,
                    )?.LeadEmail,
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
        const actor = mockCurrentUser();
        const name = mockCleanProgramField(input, 'name');
        const language = mockCleanProgramField(input, 'language');
        const type = mockCleanProgramField(input, 'type');
        const departmentId = mockCleanProgramField(input, 'departmentId');
        const leadEmail = mockCleanProgramField(input, 'leadEmail');
        const sessions = mockCleanProgramSessions(input.sessions);
        const requestedBy =
            mockData.users.find(
                (user) => user.Email === (input.userId || mockData.currentUserId),
            ) || actor;
        if (requestedBy.Email !== mockData.currentUserId && !canApprove(mockToUserDTO(actor))) {
            throw new Error('requester_edit_not_allowed');
        }
        const place = input.placeId
            ? mockData.places.find((item) => item.Id === input.placeId)
            : undefined;
        if (input.placeId && !place) throw new Error('place_not_found');
        mockAssertPlaceAvailability(place, sessions);
        const created: ProgramRequest = {
            Id: mockUuid(),
            DisplayId: mockData.nextDisplayId.program_request++,
            Name: name,
            Language: language,
            Type: type,
            UserId: requestedBy.Email,
            Status: 'draft',
            PlaceId: place ? place.Id : '',
            DepartmentId: departmentId,
            LeadEmail: leadEmail,
            Participants: participants.join(', '),
            SessionsJson: mockProgramSessionsJson(sessions),
        };
        mockData.programRequests.push(created);
        return mockBuildProgramRequestDTO(created);
    },
    updateProgramRequest: (id: string, input: UpdateProgramRequestInput) => {
        const request = mockData.programRequests.find((item) => item.Id === id);
        if (!request) throw new Error('request_not_found');
        const actor = mockCurrentUser();
        const name = mockCleanProgramField(input, 'name');
        const language = mockCleanProgramField(input, 'language');
        const type = mockCleanProgramField(input, 'type');
        const departmentId = mockCleanProgramField(input, 'departmentId');
        const leadEmail = mockCleanProgramField(input, 'leadEmail');
        const sessions = mockCleanProgramSessions(input.sessions);
        const isOwner =
            request.UserId === mockData.currentUserId ||
            mockParseParticipants(request.Participants).includes(mockData.currentUserId);
        if (!(canApprove(mockToUserDTO(actor)) || (isOwner && request.Status === 'draft'))) {
            throw new Error('edit_not_allowed');
        }
        if (['rejected', 'cancelled'].includes(request.Status)) {
            throw new Error('request_not_editable');
        }
        const place = input.placeId
            ? mockData.places.find((item) => item.Id === input.placeId)
            : undefined;
        if (input.placeId && !place) throw new Error('place_not_found');
        mockAssertPlaceAvailability(place, sessions, id);
        if (request.PlaceId !== (place ? place.Id : '') && !canApprove(mockToUserDTO(actor))) {
            throw new Error('place_edit_not_allowed');
        }
        const requestedBy = mockData.users.find((user) => user.Email === input.userId);
        if (!requestedBy) throw new Error('requester_not_found');
        if (request.UserId !== requestedBy.Email && !canApprove(mockToUserDTO(actor))) {
            throw new Error('requester_edit_not_allowed');
        }
        request.Name = name;
        request.Language = language;
        request.Type = type;
        request.UserId = requestedBy.Email;
        request.PlaceId = place ? place.Id : '';
        request.DepartmentId = departmentId;
        request.LeadEmail = leadEmail;
        request.Participants = mockParseParticipants(input.participants).join(', ');
        request.SessionsJson = mockProgramSessionsJson(sessions);
        return mockBuildProgramRequestDTO(request);
    },
    updateProgramRequestParticipants: (id: string, input: UpdateRequestParticipantsInput) => {
        const request = mockData.programRequests.find((item) => item.Id === id);
        if (!request) throw new Error('request_not_found');
        const actor = mockCurrentUser();
        const isOwner =
            request.UserId === mockData.currentUserId ||
            mockParseParticipants(request.Participants).includes(mockData.currentUserId);
        if (!(canApprove(mockToUserDTO(actor)) || isOwner)) {
            throw new Error('participants_edit_not_allowed');
        }
        request.Participants = mockParseParticipants(input.participants).join(', ');
        return mockBuildProgramRequestDTO(request);
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
            if (mockParseProgramSessions(request.SessionsJson).length === 0) {
                throw new Error('At least one session is required.');
            }
            if (!canApprove(mockToUserDTO(mockCurrentUser()))) {
                const sessions = mockParseProgramSessions(request.SessionsJson);
                const blockingBlock = mockData.blocks
                    .filter((block) => !block.Place)
                    .find((block) =>
                        sessions.some(
                            (session) =>
                                session.StartDateTime < block.EndDateTime &&
                                block.StartDateTime < session.EndDateTime,
                        ),
                    );
                if (blockingBlock) {
                    throw new Error(
                        'This request overlaps with a blocked time: ' + blockingBlock.Name,
                    );
                }
            }
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
        if (!canUseTickets(mockToUserDTO(mockCurrentUser()))) {
            throw new Error('Tickets are not available for your role.');
        }
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
    updateTicket: (id: string, input: UpdateTicketInput) => {
        if (!canUseTickets(mockToUserDTO(mockCurrentUser()))) {
            throw new Error('Tickets are not available for your role.');
        }
        const ticket = mockData.tickets.find((item) => item.Id === id);
        if (!ticket) throw new Error('ticket_not_found');
        if (!input.title.trim()) throw new Error('Title is required.');
        ticket.Title = input.title;
        ticket.Description = input.description || '';
        return mockBuildTicketDTO(ticket);
    },
    performTicketAction: (ticketId: string, action: TicketAction, assigneeId: string | null) => {
        if (!canUseTickets(mockToUserDTO(mockCurrentUser()))) {
            throw new Error('Tickets are not available for your role.');
        }
        const ticket = mockData.tickets.find((t) => t.Id === ticketId)!;
        if (!canTransitionTicket(ticket.Status, action)) throw new Error('invalid_transition');
        const actorName = mockCurrentUser().Name;
        if (action === 'assign') {
            ticket.Status = 'pending';
            ticket.AssigneeId = assigneeId || '';
            const assignee = mockData.users.find((u) => u.Email === ticket.AssigneeId);
            mockInsertActionComment(
                'ticket',
                ticketId,
                mockData.currentUserId,
                actorName +
                    ' assigned this ticket to ' +
                    (assignee ? assignee.Name : 'the assignee') +
                    '.',
            );
        } else if (action === 'close') {
            ticket.Status = 'closed';
            mockInsertActionComment(
                'ticket',
                ticketId,
                mockData.currentUserId,
                actorName + ' closed this ticket.',
            );
        } else if (action === 'reopen') {
            ticket.Status = 'pending';
            mockInsertActionComment(
                'ticket',
                ticketId,
                mockData.currentUserId,
                actorName + ' reopened this ticket.',
            );
        }
        return ticket.Status;
    },
    addComment: (requestId: string, message: string) => {
        const isInventory = mockData.inventoryRequests.some((r) => r.Id === requestId);
        const isTicket = mockData.tickets.some((t) => t.Id === requestId);
        if (isTicket && !canUseTickets(mockToUserDTO(mockCurrentUser()))) {
            throw new Error('Tickets are not available for your role.');
        }
        const created = mockInsertActionComment(
            isTicket ? 'ticket' : isInventory ? 'inventory' : 'program',
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
                        // Keep the mock responsive, but make the initial
                        // dashboard round trip visibly closer to production,
                        // where it reads several Sheets-backed datasets.
                        fnName === 'getDashboard'
                            ? 900 + Math.random() * 600
                            : 300 + Math.random() * 500,
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
