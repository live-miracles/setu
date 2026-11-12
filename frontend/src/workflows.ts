// Client-side view of the request policy in
// supabase/functions/_shared/request-policy.ts — the same module the edge
// function authorizes with, so the buttons offered here and the checks made
// there cannot drift. These helpers only adapt DTOs to it; the SQL transition
// functions remain the authoritative executor.
import {
    availableActions,
    canCollaborate,
    canDeleteRequest,
    canEditRequest,
    canWriteRole,
    isAdminRole,
    isApproverRole,
    isRequestParty,
    type RequestKind,
} from '../../supabase/functions/_shared/request-policy';

export function isRequestOverdue(request: InventoryRequestDTO): boolean {
    if (request.Status !== 'issued' || !request.EndDate) return false;
    // The due date is inclusive: a request becomes overdue after the end of
    // its due date, rather than at midnight at the start of that date.
    return new Date(`${request.EndDate}T23:59:59`).getTime() < Date.now();
}

export function canManageConfig(me: UserDTO): boolean {
    return isAdminRole(me.Role);
}

// Viewer is the organization-wide read-only role (the API refuses its writes).
export function canWrite(me: UserDTO): boolean {
    return canWriteRole(me.Role);
}

export function canApprove(me: UserDTO): boolean {
    return isApproverRole(me.Role);
}

export interface RequestPermissions<Action extends string> {
    actions: Action[];
    canEdit: boolean;
    canDelete: boolean;
    // Participants (and comments) are open to approvers and the requester side.
    canCollaborate: boolean;
}

export function getRequestPermissions<Action extends string>(
    kind: RequestKind,
    request: InventoryRequestDTO | ProgramRequestDTO,
    me: UserDTO,
): RequestPermissions<Action> {
    const input = {
        status: request.Status,
        role: me.Role,
        isParty: isRequestParty(me.Email, request.UserId, request.participants || []),
    };
    return {
        actions: availableActions(kind, input) as Action[],
        canEdit: canEditRequest(input),
        canDelete: canDeleteRequest(kind, input),
        canCollaborate: canCollaborate(input),
    };
}

export function getInventoryRequestActions(
    request: InventoryRequestDTO,
    me: UserDTO,
): InventoryRequestAction[] {
    return getRequestPermissions<InventoryRequestAction>('inventory', request, me).actions;
}

export function getProgramRequestActions(
    request: ProgramRequestDTO,
    me: UserDTO,
): ProgramRequestAction[] {
    return getRequestPermissions<ProgramRequestAction>('program', request, me).actions;
}
