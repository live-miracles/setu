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
type AttachmentOwnerType =
    | 'profile'
    | 'inventory_item'
    | 'inventory_request'
    | 'inventory_return'
    | 'ticket'
    | 'ticket_comment';

// ---------------------------------------------------------------------------
// Sheet row shapes (raw, one per tab; see plan section 1)
// ---------------------------------------------------------------------------

interface Department {
    Id: string;
    Name: string;
    ShortName: string;
    CreatedAt: string;
    UpdatedAt: string;
}

interface LocationRecord {
    Id: string;
    Name: string;
    CreatedAt: string;
    UpdatedAt: string;
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
    AvatarDriveFileId: string;
    NotificationEmail: boolean;
    CreatedAt: string;
    UpdatedAt: string;
}

interface RosterShift {
    Id: string;
    StartDate: string;
    EndDate: string;
    StartTime: string;
    EndTime: string;
    ShiftName: string;
    AssigneeProfileId: string;
    CreatedBy: string;
    CreatedAt: string;
    UpdatedAt: string;
}

interface EquipmentType {
    Id: string;
    Name: string;
    Description: string;
    Requestable: boolean;
    ImageDriveFileId: string;
    CreatedAt: string;
    UpdatedAt: string;
}

interface InventoryItem {
    Id: string;
    EquipmentTypeId: string;
    Name: string;
    LocationId: string;
    SerialNumber: string;
    TotalQuantity: number;
    AvailableQuantity: number;
    ImageDriveFileId: string;
    AdminNotes: string;
    CreatedAt: string;
    UpdatedAt: string;
}

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
    SubmittedAt: string;
    ApprovedAt: string;
    IssuedAt: string;
    ReturnedAt: string;
    ClosedAt: string;
    CreatedAt: string;
    UpdatedAt: string;
}

interface InventoryRequestItem {
    Id: string;
    RequestId: string;
    InventoryItemId: string;
    Quantity: number;
    IssuedQuantity: number;
    ReturnedQuantity: number;
    CreatedAt: string;
}

interface InventoryReturn {
    Id: string;
    RequestItemId: string;
    Quantity: number;
    Condition: ReturnCondition;
    Notes: string;
    ReceivedBy: string;
    CreatedAt: string;
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
    ClosedAt: string;
    CreatedAt: string;
    UpdatedAt: string;
}

interface TicketComment {
    Id: string;
    TicketId: string;
    AuthorId: string;
    Message: string;
    CreatedAt: string;
}

interface Attachment {
    Id: string;
    OwnerType: AttachmentOwnerType;
    OwnerId: string;
    DriveFileId: string;
    OriginalName: string;
    ContentType: string;
    SizeBytes: number;
    UploadedBy: string;
    CreatedAt: string;
}

interface Link {
    Id: string;
    Name: string;
    Url: string;
    DisplayOrder: number;
    Enabled: boolean;
    CreatedAt: string;
    UpdatedAt: string;
}

interface HomeContent {
    Id: string;
    SupportMessage: string;
    Guidelines: string;
    WhatsappUrl: string;
    TutorialUrl: string;
    UpdatedBy: string;
    UpdatedAt: string;
}

interface ActivityLogEntry {
    Id: string;
    Timestamp: string;
    ActorId: string;
    EntityType: string;
    EntityId: string;
    Action: string;
    BeforeJson: string;
    AfterJson: string;
    MetadataJson: string;
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

interface ProfileDTO extends Omit<Profile, 'AvatarDriveFileId'> {
    departmentName: string;
}

interface RosterShiftDTO extends RosterShift {
    assigneeName: string;
}

interface InventoryItemDTO extends InventoryItem {
    equipmentTypeName: string;
    locationName: string;
}

interface InventoryRequestItemDTO extends InventoryRequestItem {
    itemName: string;
}

interface InventoryRequestDTO extends InventoryRequest {
    requesterName: string;
    items: InventoryRequestItemDTO[];
}

interface TicketCommentDTO extends TicketComment {
    authorName: string;
}

interface TicketDTO extends Ticket {
    reporterName: string;
    assigneeName: string;
    comments: TicketCommentDTO[];
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
    locations: LocationRecord[];
    equipmentTypes: EquipmentType[];
    upcomingShifts: RosterShiftDTO[];
    inventoryItems: InventoryItemDTO[];
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
}

interface CreateInventoryItemInput {
    equipmentTypeId: string;
    name: string;
    locationId: string;
    serialNumber: string;
    totalQuantity: number;
    adminNotes: string;
}

interface CreateInventoryRequestInput {
    title: string;
    fromDate: string;
    toDate: string;
    purpose: string;
    items: { inventoryItemId: string; quantity: number }[];
}

interface ReturnItemInput {
    requestItemId: string;
    quantity: number;
    condition: ReturnCondition;
    notes: string;
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

interface AttachmentUploadResult {
    Id: string;
    DriveFileId: string;
    OriginalName: string;
    ContentType: string;
    SizeBytes: number;
}

interface AttachmentContent {
    base64: string;
    contentType: string;
    fileName: string;
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

    listLocations(): LocationRecord[];
    createLocation(input: CreateLocationInput, requestId: string): LocationRecord;

    listLinks(): Link[];
    createLink(input: CreateLinkInput, requestId: string): Link;

    getHomeContent(): HomeContent;
    updateHomeContent(input: UpdateHomeContentInput): HomeContent;
    listActivityLog(page: number): Paginated<ActivityLogEntry>;

    listRosterShifts(page: number): Paginated<RosterShiftDTO>;
    createRosterShift(input: CreateRosterShiftInput, requestId: string): RosterShiftDTO;

    listEquipmentTypes(): EquipmentType[];
    createEquipmentType(input: CreateEquipmentTypeInput, requestId: string): EquipmentType;

    listInventoryItems(page: number): Paginated<InventoryItemDTO>;
    createInventoryItem(input: CreateInventoryItemInput, requestId: string): InventoryItemDTO;

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
    addTicketComment(ticketId: string, message: string, requestId: string): TicketCommentDTO;

    uploadAttachmentChunk(
        uploadId: string,
        chunkIndex: number,
        totalChunks: number,
        base64Chunk: string,
    ): { received: number; of: number };
    finishAttachmentUpload(
        uploadId: string,
        ownerType: AttachmentOwnerType,
        ownerId: string,
        fileName: string,
        contentType: string,
        sizeBytes: number,
        requestId: string,
    ): AttachmentUploadResult;
    getAttachmentContent(attachmentId: string): AttachmentContent;
    listAttachmentsFor(ownerType: AttachmentOwnerType, ownerId: string): Attachment[];
}
