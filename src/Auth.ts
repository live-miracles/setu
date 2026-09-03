// Role is normalised here rather than passed through raw, so the frontend
// only ever sees one of the four known values — see roleOf below.
function toUserDTO(user: User): UserDTO {
    const department = user.DepartmentId ? Tables.Departments.findById(user.DepartmentId) : null;
    return Object.assign({}, user, {
        Role: roleOf(user),
        departmentName: department ? department.Name : '',
    });
}

// ---------------------------------------------------------------------------
// Roles. See UserRole in shared/types.d.ts for what each one means; the
// predicates below are the only place a role is interpreted, so widening a
// role's powers is a one-line change here rather than a grep across files.
// ---------------------------------------------------------------------------

const USER_ROLES: UserRole[] = ['admin', 'approver', 'viewer', 'user'];
const DEFAULT_USER_ROLE: UserRole = 'user';

// Never compare User.Role directly — the column predates the four-role split
// (older rows read 'member') and is hand-editable in the Sheet, so anything
// unrecognised has to fall back to the least privileged role instead of
// accidentally matching a privileged branch.
function roleOf(user: User): UserRole {
    const raw = String(user.Role || '')
        .trim()
        .toLowerCase() as UserRole;
    return USER_ROLES.indexOf(raw) === -1 ? DEFAULT_USER_ROLE : raw;
}

// Departments, places, inventory types, home content and other
// people's roles.
function canManageConfig(user: User): boolean {
    return roleOf(user) === 'admin';
}

// Act on requests (approve/reject/issue/return/cancel/close), assign and
// reopen tickets, schedule roster shifts, and read the people list.
function canApprove(user: User): boolean {
    const role = roleOf(user);
    return role === 'admin' || role === 'approver';
}

// Everyone but `user`, who is scoped to their own requests.
function canViewAllRequests(user: User): boolean {
    return roleOf(user) !== 'user';
}

// Tickets are available only to admins and approvers. They are not scoped to
// individual users, so viewer/user accounts cannot list, report, be assigned,
// or act on tickets (see Tickets.ts).
function canUseTickets(user: User): boolean {
    return canApprove(user);
}

// The read scope for a single inventory/program request. Roster shifts are
// deliberately not scoped this way — they're the team's shared schedule.
function canViewRequest(user: User, requesterId: string, participants: string[]): boolean {
    return (
        canViewAllRequests(user) ||
        requesterId === user.Email ||
        participants.indexOf(user.Email) !== -1
    );
}

// The Apps Script deployment controls which Google Workspace accounts can
// reach the app. Those accounts self-register on first call with the least
// privileged role (`user` — own requests only). There is no separate invite
// or per-user disable flow; revoking access is handled by Google Workspace.
// The row is created with an empty Phone and placeholder Name — the
// frontend shows a mandatory registration form (gated on Phone being unset)
// until the user fills in their own details, via updateOwnProfile.
function getCurrentActor(): User {
    const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
    const ownerEmail = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    if (!email) {
        throw new AuthenticationError(
            'Could not determine your Google account. Make sure you are signed in.',
        );
    }

    const isScriptOwner = Boolean(ownerEmail) && email === ownerEmail;
    const existing = Tables.Users.findById(email);
    if (existing) return isScriptOwner ? Object.assign({}, existing, { Role: 'admin' }) : existing;

    return withLock(() => {
        const alreadyCreated = Tables.Users.findById(email);
        if (alreadyCreated) return alreadyCreated;
        return Tables.Users.insert({
            Email: email,
            Name: defaultNameFromEmail(email),
            Role: isScriptOwner ? 'admin' : DEFAULT_USER_ROLE,
            DepartmentId: '',
            Phone: '',
            Whatsapp: '',
        });
    });
}

function requireUser(): User {
    return getCurrentActor();
}

function requireAdmin(): User {
    const actor = getCurrentActor();
    if (!canManageConfig(actor)) {
        throw new AuthorizationError('Administrator access is required.');
    }
    return actor;
}

function requireApprover(): User {
    const actor = getCurrentActor();
    if (!canApprove(actor)) {
        throw new AuthorizationError('Approver access is required.');
    }
    return actor;
}

function whoAmI(): UserDTO {
    return toUserDTO(requireUser());
}
