// Domain value -> daisyUI class names, kept in one place so every section
// renders the same lifecycle state the same way.

// Roles, in the order they're offered in the Admin section's picker — most
// to least privileged, matching USER_ROLES in Auth.ts.
export const USER_ROLE_ORDER: UserRole[] = ['admin', 'approver', 'viewer', 'user'];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
    admin: 'Admin',
    approver: 'Approver',
    viewer: 'Viewer',
    user: 'User',
};

export const USER_ROLE_SUMMARIES: Record<UserRole, string> = {
    admin: 'Full access, including settings and roles',
    approver: 'Approves requests, assigns tickets, schedules shifts',
    viewer: 'Sees every request but approves none',
    user: 'Sees only their own requests',
};

const USER_ROLE_BADGE: Record<UserRole, string> = {
    admin: 'badge-secondary',
    approver: 'badge-primary',
    viewer: 'badge-accent',
    user: 'badge-ghost',
};

// Auth.ts normalises Role before it ever reaches a DTO, so the lookups
// above always hit — these two just keep an unexpected value rendering as
// plain text instead of the literal string "undefined".
export function roleLabel(role: UserRole): string {
    return USER_ROLE_LABELS[role] || String(role);
}

export function roleBadgeClass(role: UserRole): string {
    return USER_ROLE_BADGE[role] || 'badge-ghost';
}

export const INVENTORY_REQUEST_STATUS_BADGE: Record<InventoryRequestStatus, string> = {
    draft: 'badge-ghost',
    submitted: 'badge-soft badge-warning',
    approved: 'badge-soft badge-success',
    issued: 'badge-soft badge-info',
    returned: 'badge-soft badge-success',
    closed: 'badge-ghost',
    rejected: 'badge-soft badge-error',
    cancelled: 'badge-ghost',
};

export const INVENTORY_REQUEST_STATUS_ACCENT: Record<InventoryRequestStatus, string> = {
    draft: 'border-base-300',
    submitted: 'border-warning',
    approved: 'border-success',
    issued: 'border-info',
    returned: 'border-success',
    closed: 'border-base-300',
    rejected: 'border-error',
    cancelled: 'border-base-300',
};

export const PROGRAM_REQUEST_STATUS_BADGE: Record<ProgramRequestStatus, string> = {
    draft: 'badge-ghost',
    submitted: 'badge-soft badge-warning',
    approved: 'badge-soft badge-success',
    rejected: 'badge-soft badge-error',
    cancelled: 'badge-ghost',
};

export const PROGRAM_REQUEST_STATUS_ACCENT: Record<ProgramRequestStatus, string> = {
    draft: 'border-base-300',
    submitted: 'border-warning',
    approved: 'border-success',
    rejected: 'border-error',
    cancelled: 'border-base-300',
};

export const INVENTORY_REQUEST_ACTION_BTN: Record<InventoryRequestAction, string> = {
    submit: 'btn-primary btn-soft',
    approve: 'btn-success btn-soft',
    reject: 'btn-error btn-soft',
    issue: 'btn-info btn-soft',
    return: 'btn-success btn-soft',
    cancel: 'btn-ghost',
    close: 'btn-ghost',
};

export const PROGRAM_REQUEST_ACTION_BTN: Record<ProgramRequestAction, string> = {
    submit: 'btn-primary btn-soft',
    approve: 'btn-success btn-soft',
    reject: 'btn-error btn-soft',
    cancel: 'btn-ghost',
};

export const TICKET_ACTION_BTN: Record<TicketAction, string> = {
    assign: 'btn-primary btn-soft',
    close: 'btn-success btn-soft',
    reopen: 'btn-ghost',
};

export function stockLevelClass(available: number, total: number): { bar: string; text: string } {
    if (total <= 0) return { bar: 'progress-neutral', text: 'text-base-content/50' };
    const ratio = available / total;
    if (ratio <= 0.3) return { bar: 'progress-error', text: 'text-error' };
    if (ratio <= 0.6) return { bar: 'progress-warning', text: 'text-warning' };
    return { bar: 'progress-success', text: 'text-success' };
}
