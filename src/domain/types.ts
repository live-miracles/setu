export type UserRole = "admin" | "member";
export type ProfileStatus = "invited" | "active" | "disabled";
export type ShiftPeriod = "Morning" | "Evening" | "Night";
export type InventoryRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "issued"
  | "returned"
  | "cancelled"
  | "closed";
export type ReturnCondition = "good" | "damaged" | "missing";
export type TicketStatus = "unassigned" | "pending" | "closed";
export type NotificationChannel = "in_app" | "email" | "push";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: ProfileStatus;
  department: string;
  timezone: string;
  phone?: string;
  whatsapp?: string;
  avatarUrl?: string;
  notificationPreferences: {
    email: boolean;
    push: boolean;
  };
}

export interface RosterShift {
  id: string;
  startsAt: string;
  endsAt: string;
  period: ShiftPeriod;
  location: string;
  assignees: Pick<Profile, "id" | "name" | "avatarUrl">[];
  notes?: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: string;
  location: string;
  available: number;
  total: number;
  serialNumber?: string;
  imageUrl?: string;
  updatedAt: string;
}

export interface InventoryRequestItem {
  id: string;
  inventoryItemId: string;
  name: string;
  quantity: number;
  returnedQuantity: number;
  returnCondition?: ReturnCondition;
}

export interface InventoryRequest {
  id: string;
  recordId?: string;
  title: string;
  requester: Pick<Profile, "id" | "name" | "department">;
  fromDate: string;
  toDate: string;
  purpose: string;
  status: InventoryRequestStatus;
  items: InventoryRequestItem[];
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
  isOverdue?: boolean;
}

export interface TicketComment {
  id: string;
  author: Pick<Profile, "id" | "name">;
  message: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  recordId?: string;
  title: string;
  description: string;
  location: string;
  status: TicketStatus;
  priority: "low" | "medium" | "high";
  reporter: Pick<Profile, "id" | "name">;
  assignee?: Pick<Profile, "id" | "name">;
  comments: TicketComment[];
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  href: string;
  read: boolean;
  createdAt: string;
}

export interface HomeLink {
  id: string;
  name: string;
  url: string;
  order: number;
}

export interface HomeContent {
  guidelines: string;
  whatsappUrl: string;
  tutorialUrl: string;
  supportMessage: string;
}

export interface DemoState {
  currentUser: Profile;
  profiles: Profile[];
  shifts: RosterShift[];
  inventory: InventoryItem[];
  requests: InventoryRequest[];
  tickets: Ticket[];
  notifications: AppNotification[];
  links: HomeLink[];
  homeContent: HomeContent;
}
