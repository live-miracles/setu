import { getRequestPermissions } from '../workflows';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const user = (Role: UserRole, Email = 'owner@example.com') =>
    ({ Email, Name: 'User', Role }) as UserDTO;

const request = (Status: string) =>
    ({
        Status,
        UserId: 'owner@example.com',
        participants: ['guest@example.com'],
    }) as unknown as InventoryRequestDTO & ProgramRequestDTO;

// What the shared detail screen offers: the Workflow actions, edit, delete and
// the participants editor all come from one Request policy for both kinds.
export function runRequestDetailAssertions(): void {
    for (const kind of ['inventory', 'program'] as const) {
        const draft = getRequestPermissions<string>(kind, request('draft'), user('user'));
        assert(draft.actions.join(',') === 'submit', `${kind}: the requester submits a draft`);
        assert(
            draft.canEdit && draft.canDelete,
            `${kind}: the requester edits and deletes a draft`,
        );
        assert(draft.canCollaborate, `${kind}: the requester manages participants`);

        const guest = getRequestPermissions<string>(
            kind,
            request('draft'),
            user('user', 'guest@example.com'),
        );
        assert(guest.canEdit && guest.canCollaborate, `${kind}: a participant is a party`);

        const submitted = getRequestPermissions<string>(kind, request('submitted'), user('user'));
        assert(
            !submitted.canEdit && !submitted.canDelete,
            `${kind}: a submitted request is locked`,
        );
        assert(submitted.actions.length === 0, `${kind}: the requester has no action on it`);

        const approver = getRequestPermissions<string>(
            kind,
            request('submitted'),
            user('approver', 'boss@example.com'),
        );
        assert(
            approver.actions.includes('approve') && approver.actions.includes('reject'),
            `${kind}: an approver decides a submitted request`,
        );
        assert(approver.canEdit, `${kind}: an approver edits in any status`);

        const stranger = getRequestPermissions<string>(
            kind,
            request('draft'),
            user('user', 'stranger@example.com'),
        );
        assert(
            !stranger.canEdit && !stranger.canDelete && !stranger.canCollaborate,
            `${kind}: a stranger changes nothing`,
        );
        assert(stranger.actions.length === 0, `${kind}: a stranger has no actions`);

        const viewer = getRequestPermissions<string>(kind, request('draft'), user('viewer'));
        assert(
            !viewer.canEdit && !viewer.canDelete && viewer.actions.length === 0,
            `${kind}: a viewer is read-only`,
        );
    }
}
