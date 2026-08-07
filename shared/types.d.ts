// Shared contract between the Apps Script backend and the frontend.
// Deliberately has NO import/export statements: both tsconfig.json files
// include this file directly, and a file with zero top-level import/export
// is treated by TypeScript as a global script, so every interface/type here
// becomes an ambient global visible in every backend and frontend file
// without an import — matching Apps Script's own concatenated-global-scope
// execution model (the same reason SheetTable.ts's `Tables`, Utils.ts's
// `nowIso`, etc. are callable from any other file with no import).

// Listed most- to least-privileged, and strictly nested: `user` sees only
// requests they raised or are a participant on; `viewer` sees every request
// but can act on none; `approver` can additionally approve/reject/issue/
// return requests, assign tickets and schedule shifts; `admin` can also edit
// configuration (departments, places, inventory types, links, home content)
// and other people's roles. Every check goes through the canX helpers in
// Auth.ts rather than comparing User.Role directly — rows written before
// this split carry the old 'member' value, which those helpers fold into
// 'user'.
type UserRole = 'admin' | 'approver' | 'viewer' | 'user';
type InventoryRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'issued'
    | 'returned'
    | 'cancelled'
    | 'closed';
type ProgramRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
type ReturnCondition = 'good' | 'damaged' | 'missing';
type TicketStatus = 'unassigned' | 'pending' | 'closed';
type InventoryRequestAction =
    'submit' | 'approve' | 'reject' | 'issue' | 'return' | 'cancel' | 'close';
type ProgramRequestAction = 'submit' | 'approve' | 'reject' | 'cancel';
type TicketAction = 'assign' | 'close' | 'reopen';

// ---------------------------------------------------------------------------
// Sheet row shapes (raw, one per tab)
// ---------------------------------------------------------------------------

interface Department {
    Id: string;
    Name: string;
    ShortName: string;
    LeadEmail: string;
}

interface Place {
    Id: string;
    Name: string;
}

// Email is the primary key itself (lowercased) — no separate generated id.
// See the email-domain auto-registration in Auth.ts and the keyColumn
// support in SheetTable.ts. Phone starts empty on auto-creation and is
// required (like Name) once the user submits the registration/profile form
// (see updateOwnProfile in Admin.ts) — the frontend gates the rest of the
// app on Phone being set, rather than a separate registered flag.
interface User {
    Email: string;
    Name: string;
    Role: UserRole;
    DepartmentId: string;
    Phone: string;
    Whatsapp: string;
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
    ImageId: string;
    DepartmentId: string;
    LeadEmail: string;
    // Comma-separated emails. Co-own the request (see the submit-permission
    // check in Inventory.ts) and are notified alongside UserId.
    Participants: string;
}

interface InventoryItem {
    Id: string;
    RequestId: string;
    InventoryTypeId: string;
    Quantity: number;
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
    DepartmentId: string;
    LeadEmail: string;
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

// The audit trail for InventoryRequests, ProgramRequests and Tickets: every
// status change is narrated here by the acting user, alongside whatever
// comments people type themselves. RequestId points at the owning row; addComment
// resolves the type by looking the id up in Comments.ts.
interface CommentRecord {
    Id: string;
    Timestamp: string;
    RequestId: string;
    UserId: string;
    Message: string;
}

interface Link {
    Id: string;
    Name: string;
    Url: string;
    Enabled: boolean;
}

// A named shift with default clock-in/out times, so scheduling a roster
// entry can prefill Start time/End time once a preset is picked instead of
// requiring both every time. See listShiftPresets/createShiftPreset in
// Admin.ts and the shift-name select in roster.ts.
interface ShiftPreset {
    Id: string;
    Name: string;
    DefaultStartTime: string;
    DefaultEndTime: string;
}

interface ProgramType {
    Id: string;
    Name: string;
}

interface SessionType {
    Id: string;
    Name: string;
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
    NotificationEmail: string;
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
    departmentName: string;
    participants: string[];
    items: InventoryItemDTO[];
    comments: CommentDTO[];
}

interface ProgramRequestDTO extends ProgramRequest {
    userName: string;
    placeName: string;
    departmentName: string;
    participants: string[];
    sessions: ProgramSession[];
    comments: CommentDTO[];
}

interface CommentDTO extends CommentRecord {
    userName: string;
}

interface TicketDTO extends Ticket {
    assigneeName: string;
    comments: CommentDTO[];
}

interface Paginated<T> {
    items: T[];
    page: number;
    pageSize: number;
    totalCount: number;
}

type SortDirection = 'asc' | 'desc';

interface InventoryRequestQuery {
    q?: string;
    statuses?: InventoryRequestStatus[];
    inventoryTypeId?: string;
    sortBy?: 'id' | 'name' | 'status' | 'startDate' | 'endDate' | 'requester';
    sortDirection?: SortDirection;
}

interface ProgramRequestQuery {
    q?: string;
    statuses?: ProgramRequestStatus[];
    placeId?: string;
    dateScope?: 'ongoing-future' | 'past' | '';
    sortBy?: 'id' | 'name' | 'status' | 'place' | 'sessionStart' | 'requester';
    sortDirection?: SortDirection;
}

interface TicketQuery {
    q?: string;
    statuses?: TicketStatus[];
    assigneeId?: string;
    sortBy?: 'id' | 'title' | 'status' | 'assignee';
    sortDirection?: SortDirection;
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
    shiftPresets: ShiftPreset[];
    programTypes: ProgramType[];
    sessionTypes: SessionType[];
    failedEmailCount: number;
}

// ---------------------------------------------------------------------------
// Create/update input shapes
// ---------------------------------------------------------------------------

interface CreateDepartmentInput {
    name: string;
    shortName: string;
    leadEmail: string;
}

interface CreatePlaceInput {
    name: string;
}

interface UpdateUserInput {
    name?: string;
    role?: UserRole;
    departmentId?: string;
    phone?: string;
    whatsapp?: string;
}

interface CreateUserInput {
    email: string;
    name: string;
    role: UserRole;
    departmentId: string;
    phone: string;
    whatsapp: string;
}

interface UpdateOwnProfileInput {
    name?: string;
    departmentId?: string;
    phone?: string;
    whatsapp?: string;
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
    userId: string;
    startDate: string;
    endDate: string;
    items: { inventoryTypeId: string; quantity: number }[];
    imageId: string;
    departmentId: string;
    leadEmail: string;
    participants: string;
}

interface UpdateInventoryRequestInput {
    name: string;
    userId: string;
    startDate: string;
    endDate: string;
    items: { inventoryTypeId: string; quantity: number }[];
    departmentId: string;
    leadEmail: string;
    participants: string;
}

// A return always covers every item on the request in full — see
// performInventoryRequestAction's 'return' branch in Inventory.ts — so this
// only needs to carry the condition each item came back in, not a quantity.
interface ReturnItemInput {
    requestItemId: string;
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
    userId: string;
    placeId: string;
    sessions: ProgramSessionInput[];
    departmentId: string;
    leadEmail: string;
    participants: string;
}

interface UpdateProgramRequestInput {
    name: string;
    type: string;
    userId: string;
    placeId: string;
    sessions: ProgramSessionInput[];
    departmentId: string;
    leadEmail: string;
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
    notificationEmail: string;
}

interface CreateShiftPresetInput {
    name: string;
    defaultStartTime: string;
    defaultEndTime: string;
}

interface CreateNamedOptionInput {
    name: string;
}

// ---------------------------------------------------------------------------
// The full google.script.run contract. Backend functions must match these
// signatures; the frontend's api.ts typed wrapper is authored directly against
// this type.
// ---------------------------------------------------------------------------

interface Api {
    whoAmI(): UserDTO;
    getDashboard(): DashboardPayload;

    listUsers(): UserDTO[];
    createUser(input: CreateUserInput, requestId: string): UserDTO;
    updateUser(userId: string, patch: UpdateUserInput): UserDTO;
    updateOwnProfile(patch: UpdateOwnProfileInput): UserDTO;

    listDepartments(): Department[];
    createDepartment(input: CreateDepartmentInput, requestId: string): Department;
    updateDepartment(id: string, input: CreateDepartmentInput, requestId: string): Department;
    deleteDepartment(id: string, requestId: string): void;

    listPlaces(): Place[];
    createPlace(input: CreatePlaceInput, requestId: string): Place;
    updatePlace(id: string, input: CreatePlaceInput, requestId: string): Place;
    deletePlace(id: string, requestId: string): void;

    listLinks(): Link[];
    createLink(input: CreateLinkInput, requestId: string): Link;
    updateLink(id: string, input: CreateLinkInput, requestId: string): Link;
    deleteLink(id: string, requestId: string): void;

    getHomeContent(): HomeContent;
    updateHomeContent(input: UpdateHomeContentInput): HomeContent;

    listShiftPresets(): ShiftPreset[];
    createShiftPreset(input: CreateShiftPresetInput, requestId: string): ShiftPreset;
    updateShiftPreset(id: string, input: CreateShiftPresetInput, requestId: string): ShiftPreset;
    deleteShiftPreset(id: string, requestId: string): void;

    listProgramTypes(): ProgramType[];
    createProgramType(input: CreateNamedOptionInput, requestId: string): ProgramType;
    updateProgramType(id: string, input: CreateNamedOptionInput, requestId: string): ProgramType;
    deleteProgramType(id: string, requestId: string): void;

    listSessionTypes(): SessionType[];
    createSessionType(input: CreateNamedOptionInput, requestId: string): SessionType;
    updateSessionType(id: string, input: CreateNamedOptionInput, requestId: string): SessionType;
    deleteSessionType(id: string, requestId: string): void;

    listRosters(page: number): Paginated<RosterDTO>;
    createRoster(input: CreateRosterInput, requestId: string): RosterDTO;
    updateRoster(id: string, input: CreateRosterInput, requestId: string): RosterDTO;
    deleteRoster(id: string, requestId: string): void;

    listInventoryTypes(): InventoryTypeDTO[];
    createInventoryType(input: CreateInventoryTypeInput, requestId: string): InventoryTypeDTO;
    updateInventoryType(
        id: string,
        input: CreateInventoryTypeInput,
        requestId: string,
    ): InventoryTypeDTO;
    deleteInventoryType(id: string, requestId: string): void;

    listInventoryRequests(
        page: number,
        query?: InventoryRequestQuery,
    ): Paginated<InventoryRequestDTO>;
    getInventoryRequest(id: string): InventoryRequestDTO;
    createInventoryRequest(
        input: CreateInventoryRequestInput,
        requestId: string,
    ): InventoryRequestDTO;
    updateInventoryRequest(
        id: string,
        input: UpdateInventoryRequestInput,
        requestId: string,
    ): InventoryRequestDTO;
    performInventoryRequestAction(
        requestId: string,
        action: InventoryRequestAction,
        note: string,
        returnItems: ReturnItemInput[] | null,
        dedupeRequestId: string,
    ): InventoryRequestStatus;

    listProgramRequests(page: number, query?: ProgramRequestQuery): Paginated<ProgramRequestDTO>;
    getProgramRequest(id: string): ProgramRequestDTO;
    createProgramRequest(input: CreateProgramRequestInput, requestId: string): ProgramRequestDTO;
    updateProgramRequest(
        id: string,
        input: UpdateProgramRequestInput,
        requestId: string,
    ): ProgramRequestDTO;
    performProgramRequestAction(
        requestId: string,
        action: ProgramRequestAction,
        note: string,
        dedupeRequestId: string,
    ): ProgramRequestStatus;

    listTickets(page: number, query?: TicketQuery): Paginated<TicketDTO>;
    getTicket(id: string): TicketDTO;
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
