export type UserRole = 'admin' | 'member';
export type InventoryRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'issued'
    | 'returned'
    | 'cancelled'
    | 'closed';
export type ProgramRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'closed';
export type ReturnCondition = 'good' | 'damaged' | 'missing';
export type TicketStatus = 'unassigned' | 'pending' | 'closed';

// Id is the lowercase Google-account email itself (also the login
// identity) — there is no separate uuid or auth-linking column.
export interface User {
    id: string;
    name: string;
    role: UserRole;
    department: string;
    timezone: string;
    phone?: string;
    whatsapp?: string;
}

export interface Roster {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    user: Pick<User, 'id' | 'name'>;
}

export interface InventoryType {
    id: string;
    name: string;
    description?: string;
    requestable: boolean;
    imageDriveId?: string;
    totalQuantity: number;
    availableQuantity: number;
}

export interface InventoryRequestItem {
    id: string;
    inventoryTypeId: string;
    name: string;
    quantity: number;
    issuedQuantity: number;
    returnedQuantity: number;
    condition?: ReturnCondition;
}

export interface Comment {
    id: string;
    timestamp: string;
    author: Pick<User, 'id' | 'name'>;
    message: string;
}

export interface InventoryRequest {
    id: string;
    displayId: number;
    name: string;
    requester: Pick<User, 'id' | 'name' | 'department'>;
    startDate: string;
    endDate: string;
    status: InventoryRequestStatus;
    items: InventoryRequestItem[];
    images: string[];
    comments: Comment[];
}

export interface Session {
    id: string;
    name: string;
    type: string;
    startDateTime: string;
    endDateTime: string;
}

export interface ProgramRequest {
    id: string;
    displayId: number;
    name: string;
    type: string;
    requester: Pick<User, 'id' | 'name' | 'department'>;
    place: string;
    status: ProgramRequestStatus;
    sessions: Session[];
    comments: Comment[];
}

export interface Ticket {
    id: string;
    displayId: number;
    title: string;
    description: string;
    status: TicketStatus;
    assignee?: Pick<User, 'id' | 'name'>;
}

export interface HomeLink {
    id: string;
    name: string;
    url: string;
}

export interface HomeContent {
    guidelines: string;
    whatsappUrl: string;
    tutorialUrl: string;
    supportMessage: string;
}

export interface FailedEmail {
    id: string;
    timestamp: string;
    user?: Pick<User, 'id' | 'name'>;
    title: string;
    message: string;
    error: string;
}

export interface DemoState {
    currentUser: User;
    users: User[];
    rosters: Roster[];
    inventoryTypes: InventoryType[];
    inventoryRequests: InventoryRequest[];
    programRequests: ProgramRequest[];
    tickets: Ticket[];
    links: HomeLink[];
    homeContent: HomeContent;
}
