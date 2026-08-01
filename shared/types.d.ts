// Shared contract between the Apps Script backend and the frontend.
// Deliberately has NO import/export statements: both tsconfig.json files
// include this file directly, and a file with zero top-level import/export
// is treated by TypeScript as a global script, so every interface/type here
// becomes an ambient global visible in every backend and frontend file
// without an import — matching Apps Script's own concatenated-global-scope
// execution model (the same reason SheetTable.ts's `Tables`, Utils.ts's
// `nowIso`, etc. are callable from any other file with no import).

type UserRole = 'admin' | 'member';
type ProfileStatus = 'invited' | 'active' | 'disabled';
type InventoryRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'issued'
    | 'returned'
    | 'cancelled'
    | 'closed';
type ReturnCondition = 'good' | 'damaged' | 'missing';
type TicketStatus = 'unassigned' | 'pending' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high';
type InventoryRequestAction =
    'submit' | 'approve' | 'reject' | 'issue' | 'return' | 'cancel' | 'close';
type TicketAction = 'assign' | 'close' | 'reopen';
// Only inventory requests carry comments today (their status-change
// history, plus manual notes). Extend this union when a new commentable
// section is added (e.g. studio booking requests).
type CommentOwnerType = 'inventory_request';

// ---------------------------------------------------------------------------
// Sheet row shapes (raw, one per tab; see plan section 1)
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

interface Profile {
    Id: string;
    Email: string;
    Name: string;
    Role: UserRole;
    Status: ProfileStatus;
    DepartmentId: string;
    Timezone: string;
    Phone: string;
    Whatsapp: string;
    NotificationEmail: boolean;
}

interface RosterShift {
    Id: string;
    StartDate: string;
    EndDate: string;
    StartTime: string;
    EndTime: string;
    ShiftName: string;
    AssigneeProfileId: string;
}

interface EquipmentType {
    Id: string;
    Name: string;
    Description: string;
    Requestable: boolean;
    ImageDriveFileId: string;
    TotalQuantity: number;
}

// Status-change history (who/when) lives in Comments (OwnerType
// 'inventory_request'), posted by the system actor — see Comments.ts.
interface InventoryRequest {
    Id: string;
    DisplayId: number;
    Title: string;
    RequesterId: string;
    FromDate: string;
    ToDate: string;
    Purpose: string;
    Status: InventoryRequestStatus;
    AdminNote: string;
}

interface InventoryRequestItem {
    Id: string;
    RequestId: string;
    EquipmentTypeId: string;
    Quantity: number;
    IssuedQuantity: number;
    ReturnedQuantity: number;
    Condition: ReturnCondition | '';
}

interface Ticket {
    Id: string;
    DisplayId: number;
    Title: string;
    Description: string;
    LocationId: string;
    LocationName: string;
    Priority: TicketPriority;
    Status: TicketStatus;
    ReporterId: string;
    AssigneeId: string;
}

// Also used to narrate status changes on its owner: AuthorId ===
// SYSTEM_ACTOR_ID for those, a real Profile Id for user-typed comments.
// See Comments.ts.
interface CommentRecord {
    Id: string;
    OwnerType: CommentOwnerType;
    OwnerId: string;
    AuthorId: string;
    Message: string;
    CreatedAt: string;
}

interface Link {
    Id: string;
    Name: string;
    Url: string;
    DisplayOrder: number;
    Enabled: boolean;
}

interface HomeContent {
    Id: string;
    SupportMessage: string;
    Guidelines: string;
    WhatsappUrl: string;
    TutorialUrl: string;
    UpdatedBy: string;
}

interface FailedNotification {
    Id: string;
    Timestamp: string;
    RecipientId: string;
    Channel: 'email';
    Title: string;
    Message: string;
    Error: string;
}

// ---------------------------------------------------------------------------
// Joined/display DTOs returned to the frontend
// ---------------------------------------------------------------------------

interface ProfileDTO extends Profile {
    departmentName: string;
}

interface RosterShiftDTO extends RosterShift {
    assigneeName: string;
}

interface EquipmentTypeDTO extends EquipmentType {
    availableQuantity: number;
}

interface InventoryRequestItemDTO extends InventoryRequestItem {
    itemName: string;
}

interface InventoryRequestDTO extends InventoryRequest {
    requesterName: string;
    items: InventoryRequestItemDTO[];
    comments: CommentDTO[];
}

interface CommentDTO extends CommentRecord {
    authorName: string;
}

interface TicketDTO extends Ticket {
    reporterName: string;
    assigneeName: string;
}

interface Paginated<T> {
    items: T[];
    page: number;
    pageSize: number;
    totalCount: number;
}

interface DashboardPayload {
    me: ProfileDTO;
    departments: Department[];
    locations: Place[];
    equipmentTypes: EquipmentTypeDTO[];
    upcomingShifts: RosterShiftDTO[];
    inventoryRequests: InventoryRequestDTO[];
    tickets: TicketDTO[];
    links: Link[];
    homeContent: HomeContent;
    failedNotificationCount: number;
}

// ---------------------------------------------------------------------------
// Create/update input shapes
// ---------------------------------------------------------------------------

interface CreateDepartmentInput {
    name: string;
    shortName: string;
}

interface CreateLocationInput {
    name: string;
}

interface InviteUserInput {
    email: string;
    name: string;
    role: UserRole;
    departmentId: string;
    timezone: string;
}

interface UpdateUserInput {
    role?: UserRole;
    status?: ProfileStatus;
    departmentId?: string;
    timezone?: string;
}

interface UpdateOwnProfileInput {
    name?: string;
    phone?: string;
    whatsapp?: string;
    timezone?: string;
    notificationEmail?: boolean;
}

interface CreateRosterShiftInput {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    shiftName: string;
    assigneeProfileId: string;
}

interface CreateEquipmentTypeInput {
    name: string;
    description: string;
    requestable: boolean;
    totalQuantity: number;
}

interface CreateInventoryRequestInput {
    title: string;
    fromDate: string;
    toDate: string;
    purpose: string;
    items: { equipmentTypeId: string; quantity: number }[];
}

interface ReturnItemInput {
    requestItemId: string;
    quantity: number;
    condition: ReturnCondition;
}

interface CreateTicketInput {
    title: string;
    description: string;
    locationId: string;
    priority: TicketPriority;
}

interface CreateLinkInput {
    name: string;
    url: string;
    displayOrder: number;
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
    whoAmI(): ProfileDTO;
    getDashboard(): DashboardPayload;

    listUsers(): ProfileDTO[];
    inviteUser(input: InviteUserInput, requestId: string): ProfileDTO;
    updateUser(profileId: string, patch: UpdateUserInput): ProfileDTO;
    updateOwnProfile(patch: UpdateOwnProfileInput): ProfileDTO;

    listDepartments(): Department[];
    createDepartment(input: CreateDepartmentInput, requestId: string): Department;

    listLocations(): Place[];
    createLocation(input: CreateLocationInput, requestId: string): Place;

    listLinks(): Link[];
    createLink(input: CreateLinkInput, requestId: string): Link;

    getHomeContent(): HomeContent;
    updateHomeContent(input: UpdateHomeContentInput): HomeContent;

    listRosterShifts(page: number): Paginated<RosterShiftDTO>;
    createRosterShift(input: CreateRosterShiftInput, requestId: string): RosterShiftDTO;

    listEquipmentTypes(): EquipmentTypeDTO[];
    createEquipmentType(input: CreateEquipmentTypeInput, requestId: string): EquipmentTypeDTO;

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

    listTickets(page: number): Paginated<TicketDTO>;
    createTicket(input: CreateTicketInput, requestId: string): TicketDTO;
    performTicketAction(
        ticketId: string,
        action: TicketAction,
        assigneeId: string | null,
        dedupeRequestId: string,
    ): TicketStatus;
    addComment(
        ownerType: CommentOwnerType,
        ownerId: string,
        message: string,
        requestId: string,
    ): CommentDTO;

}
