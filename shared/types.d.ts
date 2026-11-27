// Shared contract between the Supabase Edge Function and the frontend.
// Deliberately has NO import/export statements: both tsconfig.json files
// include this file directly, and a file with zero top-level import/export
// is treated by TypeScript as a global script, so every interface/type here
// becomes an ambient global visible in every backend and frontend file
// without an import.

// Listed most- to least-privileged, and strictly nested: `user` sees only
// requests they raised or are a participant on; `viewer` sees every request
// but can act on none; `approver` can additionally approve/reject/issue/
// return requests and schedule shifts; `admin` can also edit configuration
// (departments, places, inventory types, home content) and other people's
// roles.
type UserRole = 'admin' | 'approver' | 'viewer' | 'user';
type InventoryRequestStatus =
    'draft' | 'submitted' | 'approved' | 'rejected' | 'issued' | 'cancelled' | 'closed';
type ProgramRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
type ReturnCondition = 'returned' | 'damaged' | 'missing';
type InventoryRequestAction =
    | 'submit'
    | 'approve'
    | 'reject'
    | 'issue'
    | 'cancel'
    | 'close'
    | 'revise'
    | 'unapprove'
    | 'reopen';
type ProgramRequestAction =
    'submit' | 'approve' | 'reject' | 'cancel' | 'revise' | 'unapprove' | 'reopen';

// ---------------------------------------------------------------------------
// Entity shapes: the stored fields of each entity. The DTOs further down extend
// them with the joined and derived fields the API adds.
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

// Email is the key the app uses to identify a user (lowercased). Phone starts
// empty when a profile is created at first sign-in and is required (like Name)
// once the user submits the profile form (updateOwnProfile) — the frontend
// gates the rest of the app on Phone being set, rather than a separate
// registered flag.
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
    ShiftTypeId: string;
    ShiftName: string;
    Name: string;
    StartDate: string;
    EndDate: string;
    StartTime: string;
    EndTime: string;
    UserId: string;
}

// Catalog rows may optionally have physical labels. Types without labels keep
// the original quantity-only inventory behavior.
interface InventoryType {
    Id: string;
    DisplayId: number;
    Brand: string;
    Name: string;
    Model: string;
    // The inventory place's name and id; both empty when no place is set.
    Location: string;
    LocationId: string;
    Description: string;
    Requestable: boolean;
    ImageId: string;
    TotalQuantity: number | null;
}

interface InventoryLabel {
    Id: string;
    DisplayId: number;
    InventoryTypeId: string;
    Name: string;
    // Where this unit sits (an inventory place); empty means the inventory
    // type's own Location.
    Location: string;
    LocationId: string;
}

// Status-change history (who/when) lives in comments — every transition is
// narrated there as a comment authored by the acting user.
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
}

interface InventoryItem {
    InventoryTypeId: string;
    Quantity: number;
    Condition: ReturnCondition | '';
    Labels?: string[];
}

interface ProgramRequest {
    Id: string;
    DisplayId: number;
    Name: string;
    Language: string;
    Type: string;
    UserId: string;
    Status: ProgramRequestStatus;
    PlaceId: string | null;
    DepartmentId: string;
    LeadEmail: string;
}

// One or more scheduled sessions per program request. Named ProgramSession
// (not Session) to avoid ambiguity with an auth session.
interface ProgramSession {
    Name: string;
    Type: string;
    StartDateTime: string;
    EndDateTime: string;
}

// The audit trail for InventoryRequests and ProgramRequests: every status
// change is narrated here by the acting user, alongside whatever comments
// people type themselves. RequestId points at the owning row; addComment
// resolves the type by looking the id up across both request tables.
interface CommentRecord {
    Id: string;
    Timestamp: string;
    RequestId: string;
    UserId: string;
    Message: string;
    // A request's activity holds written comments, status changes made by a
    // workflow action, and edits to the request's details. Message is always a
    // plain-text summary; Data has the structure for status and edit events.
    Kind: ActivityKind;
    Data: StatusEventData | EditEventData | null;
}

type ActivityKind = 'comment' | 'status' | 'edit';

interface StatusEventData {
    from: string;
    to: string;
    action?: string;
    note?: string | null;
}

// One changed value ({field, from, to}) or one changed list ({field, added,
// removed}), such as a request's sessions or participants.
interface EditChange {
    field: string;
    from?: string | null;
    to?: string | null;
    added?: EditChangeEntry[];
    removed?: EditChangeEntry[];
    moreAdded?: number;
    moreRemoved?: number;
}

interface EditChangeEntry {
    label: string;
    startAt?: string;
    endAt?: string;
}

interface EditEventData {
    changes: EditChange[];
    truncated?: boolean;
}

// A named shift with default clock-in/out times and an optional color, so
// scheduling a roster entry can prefill times and the roster can use the
// configured color.
interface ShiftType {
    Id: string;
    Name: string;
    Color: string;
    DefaultStartTime: string;
    DefaultEndTime: string;
}

interface ProgramType {
    Name: string;
    Color: string;
}

interface ProgramLanguage {
    Name: string;
}

interface SessionType {
    Name: string;
}

interface Block {
    Id: string;
    StartDateTime: string;
    EndDateTime: string;
    Name: string;
    Place: string;
}

interface HomeContent {
    Guidelines: string;
    // Keys of the views an admin hid from the navigation and home screen
    // (see supabase/functions/_shared/views.ts). Presentation only.
    HiddenViews: string[];
    // Every view key once, in the order the admin chose for the menu and the
    // board switches. Presentation only.
    ViewOrder: string[];
}

interface SettingsPayload {
    guidelines: string;
    shiftTypes: ShiftType[];
    programTypes: ProgramType[];
    programLanguages: ProgramLanguage[];
    sessionTypes: SessionType[];
}

interface AllowedEmailDomain {
    domain: string;
    enabled: boolean;
}

interface EmailCcAddress {
    email: string;
}

// ---------------------------------------------------------------------------
// Joined/display DTOs returned to the frontend
// ---------------------------------------------------------------------------

interface UserDTO extends User {
    departmentName: string;
    // Added by an administrator before getting an organisation email: the
    // account exists for rosters and requests but cannot sign in yet.
    SignInBlocked: boolean;
}

interface RosterDTO extends Roster {
    userName: string;
}

interface InventoryTypeDTO extends InventoryType {
    availableQuantity: number | null;
    labels: InventoryLabel[];
}

interface InventoryItemDTO extends InventoryItem {
    itemName: string;
    labels: Array<InventoryLabel | string>;
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
    sessionStart: string;
    sessionEnd: string;
    comments: CommentDTO[];
}

interface CommentDTO extends CommentRecord {
    userName: string;
}

interface Paginated<T> {
    items: T[];
    page: number;
    pageSize: number;
    totalCount: number;
}

// Inventory request list page; `statusCounts` counts the requests matching the
// non-status filters (search, type), so each status option can show a badge.
interface InventoryRequestPage extends Paginated<InventoryRequestDTO> {
    statusCounts: Partial<Record<InventoryRequestStatus, number>>;
}

interface CalendarMonthPayload {
    places: Place[];
    programs: ProgramRequestDTO[];
}

type SortDirection = 'asc' | 'desc';

interface InventoryRequestQuery {
    q?: string;
    statuses?: InventoryRequestStatus[];
    inventoryTypeId?: string;
    departmentId?: string;
    requesterEmail?: string;
    labelId?: string;
    sortBy?: 'id' | 'name' | 'status' | 'startDate' | 'endDate' | 'requester';
    sortDirection?: SortDirection;
}

interface ProgramRequestQuery {
    q?: string;
    statuses?: ProgramRequestStatus[];
    placeId?: string;
    departmentId?: string;
    requesterEmail?: string;
    dateScope?: 'ongoing-future' | 'past' | '';
    sortBy?: 'id' | 'name' | 'status' | 'place' | 'sessionStart' | 'requester';
    sortDirection?: SortDirection;
}

// The home screen's data, and only that: reference data (departments, places,
// inventory types, the current user, ...) is read through its own operations.
// The requests are the summary rows the home cards print, not full DTOs.
type DashboardProgramRequest = Pick<
    ProgramRequestDTO,
    'Id' | 'DisplayId' | 'Name' | 'Status' | 'userName' | 'sessionStart' | 'sessionEnd'
>;

type DashboardInventoryRequest = Pick<
    InventoryRequestDTO,
    'Id' | 'DisplayId' | 'Name' | 'Status' | 'userName' | 'StartDate' | 'EndDate'
>;

interface DashboardComment {
    kind: 'programs' | 'inventory';
    request: { Id: string; DisplayId: number; Name: string };
    comment: CommentDTO;
}

interface DashboardPayload {
    // Shifts that have not ended yet (the home cards and the roster grid).
    upcomingRosters: RosterDTO[];
    // Draft and submitted program requests, newest activity first, at most a
    // bounded sample; the count is the true total.
    pendingProgramRequests: DashboardProgramRequest[];
    pendingProgramCount: number;
    // Inventory requests still in play (see ONGOING_INVENTORY_STATUSES), the
    // same way.
    ongoingInventoryRequests: DashboardInventoryRequest[];
    ongoingInventoryCount: number;
    // The newest comments of each kind, newest first within a kind.
    recentComments: DashboardComment[];
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
    // Only accepted for a member who cannot sign in yet (SignInBlocked).
    email?: string;
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
    shiftTypeId: string;
    shiftName?: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    userId: string;
}

interface CreateInventoryTypeInput {
    brand: string;
    name: string;
    model: string;
    // An inventory place id; empty for none.
    locationId: string;
    description: string;
    requestable: boolean;
    totalQuantity: number | null;
    imageId?: string;
}

interface CreateInventoryLabelInput {
    inventoryTypeId: string;
    name: string;
    // An inventory place id; empty to use the type's place.
    locationId: string;
}

interface UpdateInventoryLabelInput {
    name: string;
    locationId: string;
}

interface CreateInventoryRequestInput {
    name: string;
    userId: string;
    startDate: string;
    endDate: string;
    items: InventoryItemInput[];
    imageId: string;
    departmentId: string;
    leadEmail: string;
    participants?: string;
}

interface UpdateInventoryRequestInput {
    name: string;
    userId: string;
    startDate: string;
    endDate: string;
    items: InventoryItemInput[];
    departmentId: string;
    leadEmail: string;
    participants?: string;
    imageId?: string;
}

interface UpdateRequestParticipantsInput {
    participants?: string;
}

interface InventoryItemInput {
    inventoryTypeId: string;
    quantity: number;
    condition?: ReturnCondition | '';
    labelIds?: string[];
}

interface ProgramSessionInput {
    name: string;
    type: string;
    startDateTime: string;
    endDateTime: string;
}

interface CreateProgramRequestInput {
    name: string;
    language: string;
    type: string;
    userId: string;
    placeId: string;
    sessions: ProgramSessionInput[];
    departmentId: string;
    leadEmail: string;
    participants?: string;
}

interface UpdateProgramRequestInput {
    name: string;
    language: string;
    type: string;
    userId: string;
    placeId: string;
    sessions: ProgramSessionInput[];
    departmentId: string;
    leadEmail: string;
    participants?: string;
}

// Fields that are left out stay as they are.
interface UpdateHomeContentInput {
    guidelines?: string;
    hiddenViews?: string[];
    viewOrder?: string[];
}

interface CreateShiftTypeInput {
    name: string;
    defaultStartTime: string | null;
    defaultEndTime: string | null;
    color: string;
}

interface CreateNamedOptionInput {
    name: string;
    color?: string;
}

interface CreateBlockInput {
    name: string;
    startDateTime: string;
    endDateTime: string;
    place: string;
}

// ---------------------------------------------------------------------------
// The application API contract. The frontend's typed wrapper and the Edge
// Function operation dispatcher are authored directly against these signatures.
// ---------------------------------------------------------------------------

interface Api {
    whoAmI(): UserDTO;
    getDashboard(): DashboardPayload;

    listUsers(): UserDTO[];
    createUser(input: CreateUserInput): UserDTO;
    updateUser(userId: string, patch: UpdateUserInput): UserDTO;
    deleteUser(userId: string): void;
    updateOwnProfile(patch: UpdateOwnProfileInput): UserDTO;

    listDepartments(): Department[];
    createDepartment(input: CreateDepartmentInput): Department;
    updateDepartment(id: string, input: CreateDepartmentInput): Department;
    deleteDepartment(id: string): void;

    listPlaces(): Place[];
    createPlace(input: CreatePlaceInput): Place;
    updatePlace(id: string, input: CreatePlaceInput): Place;
    deletePlace(id: string): void;
    listInventoryBrands(): Place[];
    createInventoryBrand(input: CreatePlaceInput): Place;
    updateInventoryBrand(id: string, input: CreatePlaceInput): Place;
    deleteInventoryBrand(id: string): void;
    listInventoryPlaces(): Place[];
    createInventoryPlace(input: CreatePlaceInput): Place;
    updateInventoryPlace(id: string, input: CreatePlaceInput): Place;
    deleteInventoryPlace(id: string): void;

    getHomeContent(): HomeContent;
    updateHomeContent(input: UpdateHomeContentInput): HomeContent;

    getSettings(): SettingsPayload;
    listAllowedEmailDomains(): AllowedEmailDomain[];
    createAllowedEmailDomain(input: { domain: string }): AllowedEmailDomain;
    deleteAllowedEmailDomain(domain: string): void;
    listEmailCcAddresses(): EmailCcAddress[];
    createEmailCcAddress(input: { email: string }): EmailCcAddress;
    deleteEmailCcAddress(email: string): void;
    createShiftType(input: CreateShiftTypeInput): ShiftType;
    updateShiftType(name: string, input: CreateShiftTypeInput): ShiftType;
    deleteShiftType(name: string): void;

    createProgramType(input: CreateNamedOptionInput): ProgramType;
    updateProgramType(name: string, input: CreateNamedOptionInput): ProgramType;
    deleteProgramType(name: string): void;

    createProgramLanguage(input: CreateNamedOptionInput): ProgramLanguage;
    updateProgramLanguage(name: string, input: CreateNamedOptionInput): ProgramLanguage;
    deleteProgramLanguage(name: string): void;

    createSessionType(input: CreateNamedOptionInput): SessionType;
    updateSessionType(name: string, input: CreateNamedOptionInput): SessionType;
    deleteSessionType(name: string): void;

    listBlocks(): Block[];
    createBlock(input: CreateBlockInput): Block;
    updateBlock(id: string, input: CreateBlockInput): Block;
    deleteBlock(id: string): void;

    listRosters(page: number): Paginated<RosterDTO>;
    createRoster(input: CreateRosterInput): RosterDTO;
    updateRoster(id: string, input: CreateRosterInput): RosterDTO;
    deleteRoster(id: string): void;

    listInventoryTypes(): InventoryTypeDTO[];
    createInventoryLabel(input: CreateInventoryLabelInput): InventoryLabel;
    updateInventoryLabel(id: string, input: UpdateInventoryLabelInput): InventoryLabel;
    deleteInventoryLabel(id: string): void;
    createInventoryType(input: CreateInventoryTypeInput): InventoryTypeDTO;
    updateInventoryType(id: string, input: CreateInventoryTypeInput): InventoryTypeDTO;
    deleteInventoryType(id: string): void;

    listInventoryRequests(page: number, query?: InventoryRequestQuery): InventoryRequestPage;
    getInventoryRequest(id: string): InventoryRequestDTO;
    createInventoryRequest(
        input: CreateInventoryRequestInput,
        clientId?: string,
    ): InventoryRequestDTO;
    updateInventoryRequest(id: string, input: UpdateInventoryRequestInput): InventoryRequestDTO;
    updateInventoryRequestParticipants(
        id: string,
        input: UpdateRequestParticipantsInput,
    ): InventoryRequestDTO;
    deleteInventoryRequest(id: string): void;
    performInventoryRequestAction(
        requestId: string,
        action: InventoryRequestAction,
        note: string,
    ): InventoryRequestStatus;

    listProgramRequests(page: number, query?: ProgramRequestQuery): Paginated<ProgramRequestDTO>;
    getProgramRequest(id: string): ProgramRequestDTO;
    getAvailablePlaces(requestId: string, sessions: ProgramSessionInput[]): Place[];
    getCalendarMonth(year: number, month: number): CalendarMonthPayload;
    createProgramRequest(input: CreateProgramRequestInput, clientId?: string): ProgramRequestDTO;
    updateProgramRequest(id: string, input: UpdateProgramRequestInput): ProgramRequestDTO;
    updateProgramRequestParticipants(
        id: string,
        input: UpdateRequestParticipantsInput,
    ): ProgramRequestDTO;
    deleteProgramRequest(id: string): void;
    performProgramRequestAction(
        requestId: string,
        action: ProgramRequestAction,
        note: string,
    ): ProgramRequestStatus;

    addComment(requestId: string, message: string, clientId?: string): CommentDTO;

    createImageUploadUrl(
        fileName: string,
        mimeType: string,
        targetType: 'inventory_request' | 'inventory_type',
        targetId: string,
    ): { path: string; token: string };
}
