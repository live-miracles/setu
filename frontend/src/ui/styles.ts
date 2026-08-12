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

export function roleLabel(role: UserRole): string {
    return USER_ROLE_LABELS[role] || String(role);
}

export function stockLevelTextClass(available: number, total: number): string {
    if (total <= 0) return 'text-gray-500';
    const ratio = available / total;
    if (ratio <= 0.3) return 'text-red-600';
    if (ratio <= 0.6) return 'text-amber-600';
    return 'text-emerald-600';
}
