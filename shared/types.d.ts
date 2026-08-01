// Shared contract between the Apps Script backend and the frontend.
// Deliberately has NO import/export statements: both tsconfig.json files
// include this file directly, and a file with zero top-level import/export
// is treated by TypeScript as a global script, so every interface/type here
// becomes an ambient global visible in every backend and frontend file
// without an import — matching Apps Script's own concatenated-global-scope
// execution model (the same reason SheetTable.ts's `Tables`, Utils.ts's
// `nowIso`, etc. are callable from any other file with no import).

type UserRole = 'admin' | 'member';
type InventoryRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'issued'
    | 'returned'
    | 'cancelled'
    | 'closed';
type ProgramRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'closed';
type ReturnCondition = 'good' | 'damaged' | 'missing';
type TicketStatus = 'unassigned' | 'pending' | 'closed';
type InventoryRequestAction =
    'submit' | 'approve' | 'reject' | 'issue' | 'return' | 'cancel' | 'close';
type ProgramRequestAction = 'submit' | 'approve' | 'reject' | 'cancel' | 'close';
type TicketAction = 'assign' | 'close' | 'reopen';

// ---------------------------------------------------------------------------
// Sheet row shapes (raw, one per tab)
// ---------------------------------------------------------------------------

interface Department {
    Id: string;
    Name: string;
    ShortName: string;
}

interface Place {
    Id: string;
    Name: string;
}

// Email is the primary key itself (lowercased) — no separate generated id.
// See the email-domain auto-registration in Auth.ts and the keyColumn
// support in SheetTable.ts. Registered starts false on auto-creation and
// flips true the first time the user submits the registration/profile form
// (see updateOwnProfile in Admin.ts) — the frontend gates the rest of the
// app behind that flag.
interface User {
    Email: string;
    Name: string;
    Role: UserRole;
    DepartmentId: string;
    Timezone: string;
    Phone: string;
    Whatsapp: string;
    Registered: boolean;
}

interface Roster {
    Id: string;
    Name: string;
    StartDate: string;
    EndDate: string;
    StartTime: string;
    EndTime: string;
    UserId: string;
}

// Type-level catalog only; there is no per-unit/serial-tracked row.
// "Available" is computed on read, not stored — see Inventory.ts.
interface InventoryType {
    Id: string;
    Name: string;
    Description: string;
    Requestable: boolean;
    ImageId: string;
    TotalQuantity: number;
}

// Status-change history (who/when) lives in Comments — every transition is
// narrated there as a comment authored by the acting user. See Comments.ts.
interface InventoryRequest {
    Id: string;
    DisplayId: number;
    Name: string;
    UserId: string;
    StartDate: string;
    EndDate: string;
    Status: InventoryRequestStatus;
    Image1Id: string;
    Image2Id: string;
    Image3Id: string;
    // Comma-separated emails. Co-own the request (see the submit-permission
    // check in Inventory.ts) and are notified alongside UserId.
    Participants: string;
}

interface InventoryItem {
    Id: string;
    RequestId: string;
    InventoryTypeId: string;
    Quantity: number;
    IssuedQuantity: number;
    ReturnedQuantity: number;
    Condition: ReturnCondition | '';
}

interface ProgramRequest {
    Id: string;
    DisplayId: number;
    Name: string;
    Type: string;
    UserId: string;
    Status: ProgramRequestStatus;
    PlaceId: string;
    Participants: string;
}

// One or more scheduled sessions per program request. Named ProgramSession
// (not Session) to avoid colliding with Apps Script's own global `Session`
// service (Session.getActiveUser(), used in Auth.ts).
interface ProgramSession {
    Id: string;
    Name: string;
    Type: string;
    RequestId: string;
    StartDateTime: string;
    EndDateTime: string;
}

interface Ticket {
    Id: string;
    DisplayId: number;
    Title: string;
    Description: string;
    Status: TicketStatus;
    AssigneeId: string;
}

// The audit trail for InventoryRequests and ProgramRequests: every status
// change is narrated here by the acting user, alongside whatever comments
// people type themselves. Exactly one of ProgramRequestId/InventoryRequestId
// is set per row (mirrors master's two-nullable-FK design); addComment
// resolves which one to populate by looking the request id up in
// InventoryRequests then ProgramRequests — see findRequestOwner in
// Comments.ts. Tickets have no comments.
interface CommentRecord {
    Id: string;
    Timestamp: string;
    ProgramRequestId: string;
    InventoryRequestId: string;
    UserId: string;
    Message: string;
}

interface Link {
    Id: string;
    Name: string;
    Url: string;
    Enabled: boolean;
}

// Generic key-value store, e.g. for the Home content fields below and
// display-id counters — Id doubles as the setting's key (see
// readHomeContent/upsertSetting in Admin.ts, getNextDisplayId in
// SheetTable.ts).
interface SettingRow {
    Id: string;
    Value: string;
}

interface HomeContent {
    SupportMessage: string;
    Guidelines: string;
    WhatsappUrl: string;
    TutorialUrl: string;
}

interface FailedEmail {
    Id: string;
    Timestamp: string;
    UserId: string;
    Title: string;
    Message: string;
    Error: string;
}

// ---------------------------------------------------------------------------
// Joined/display DTOs returned to the frontend
// ---------------------------------------------------------------------------

interface UserDTO extends User {
    departmentName: string;
}

interface RosterDTO extends Roster {
    userName: string;
}

interface InventoryTypeDTO extends InventoryType {
    availableQuantity: number;
}

interface InventoryItemDTO extends InventoryItem {
    itemName: string;
}

interface InventoryRequestDTO extends InventoryRequest {
    userName: string;
    participants: string[];
    items: InventoryItemDTO[];
    comments: CommentDTO[];
}

interface ProgramRequestDTO extends ProgramRequest {
    userName: string;
    placeName: string;
    participants: string[];
    sessions: ProgramSession[];
    comments: CommentDTO[];
}

interface CommentDTO extends CommentRecord {
    userName: string;
}

interface TicketDTO extends Ticket {
    assigneeName: string;
}

interface Paginated<T> {
    items: T[];
    page: number;
    pageSize: number;
    totalCount: number;
}

interface DashboardPayload {
    me: UserDTO;
    departments: Department[];
    places: Place[];
    inventoryTypes: InventoryTypeDTO[];
    upcomingRosters: RosterDTO[];
    inventoryRequests: InventoryRequestDTO[];
    programRequests: ProgramRequestDTO[];
    tickets: TicketDTO[];
    links: Link[];
    homeContent: HomeContent;
    failedEmailCount: number;
}

// ---------------------------------------------------------------------------
// Create/update input shapes
// ---------------------------------------------------------------------------

interface CreateDepartmentInput {
    name: string;
    shortName: string;
}

interface CreatePlaceInput {
    name: string;
}

interface UpdateUserInput {
    role?: UserRole;
    departmentId?: string;
    timezone?: string;
}

interface UpdateOwnProfileInput {
    name?: string;
    departmentId?: string;
    phone?: string;
    whatsapp?: string;
    timezone?: string;
}

interface CreateRosterInput {
    name: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    userId: string;
}

interface CreateInventoryTypeInput {
    name: string;
    description: string;
    requestable: boolean;
    totalQuantity: number;
}

interface CreateInventoryRequestInput {
    name: string;
    startDate: string;
    endDate: string;
    items: { inventoryTypeId: string; quantity: number }[];
    images: string[];
    participants: string;
}

interface ReturnItemInput {
    requestItemId: string;
    quantity: number;
    condition: ReturnCondition;
}

interface ProgramSessionInput {
    name: string;
    type: string;
    startDateTime: string;
    endDateTime: string;
}

interface CreateProgramRequestInput {
    name: string;
    type: string;
    placeId: string;
    sessions: ProgramSessionInput[];
    participants: string;
}

interface CreateTicketInput {
    title: string;
    description: string;
}

interface CreateLinkInput {
    name: string;
    url: string;
    enabled: boolean;
}

interface UpdateHomeContentInput {
    supportMessage: string;
    guidelines: string;
    whatsappUrl: string;
    tutorialUrl: string;
}

// ---------------------------------------------------------------------------
// The full google.script.run contract. Backend functions must match these
// signatures; 02-api.ts's typed wrapper is authored directly against this type.
// ---------------------------------------------------------------------------

interface Api {
    whoAmI(): UserDTO;
    getDashboard(): DashboardPayload;

    listUsers(): UserDTO[];
    updateUser(userId: string, patch: UpdateUserInput): UserDTO;
    updateOwnProfile(patch: UpdateOwnProfileInput): UserDTO;

    listDepartments(): Department[];
    createDepartment(input: CreateDepartmentInput, requestId: string): Department;

    listPlaces(): Place[];
    createPlace(input: CreatePlaceInput, requestId: string): Place;

    listLinks(): Link[];
    createLink(input: CreateLinkInput, requestId: string): Link;

    getHomeContent(): HomeContent;
    updateHomeContent(input: UpdateHomeContentInput): HomeContent;

    listRosters(page: number): Paginated<RosterDTO>;
    createRoster(input: CreateRosterInput, requestId: string): RosterDTO;

    listInventoryTypes(): InventoryTypeDTO[];
    createInventoryType(input: CreateInventoryTypeInput, requestId: string): InventoryTypeDTO;

    listInventoryRequests(page: number): Paginated<InventoryRequestDTO>;
    createInventoryRequest(
        input: CreateInventoryRequestInput,
        requestId: string,
    ): InventoryRequestDTO;
    performInventoryRequestAction(
        requestId: string,
        action: InventoryRequestAction,
        note: string,
        returnItems: ReturnItemInput[] | null,
        dedupeRequestId: string,
    ): InventoryRequestStatus;

    listProgramRequests(page: number): Paginated<ProgramRequestDTO>;
    createProgramRequest(input: CreateProgramRequestInput, requestId: string): ProgramRequestDTO;
    performProgramRequestAction(
        requestId: string,
        action: ProgramRequestAction,
        note: string,
        dedupeRequestId: string,
    ): ProgramRequestStatus;

    listTickets(page: number): Paginated<TicketDTO>;
    createTicket(input: CreateTicketInput, requestId: string): TicketDTO;
    performTicketAction(
        ticketId: string,
        action: TicketAction,
        assigneeId: string | null,
        dedupeRequestId: string,
    ): TicketStatus;
    addComment(requestId: string, message: string, dedupeRequestId: string): CommentDTO;

    uploadImage(base64Data: string, fileName: string, mimeType: string): string;
}
