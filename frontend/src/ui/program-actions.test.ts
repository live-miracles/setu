import {
    buildDuplicateProgramInput,
    canRescheduleProgram,
    getProgramRequestActions,
    getLocalDateFromSession,
    shiftProgramSessions,
} from './program-actions';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const request = (overrides: Partial<ProgramRequestDTO> = {}): ProgramRequestDTO =>
    ({
        Id: 'program-1',
        DisplayId: 1,
        Name: 'Orientation',
        Language: 'English',
        Type: 'Workshop',
        UserId: 'owner@example.com',
        Status: 'submitted',
        PlaceId: 'room-1',
        DepartmentId: 'dept-1',
        LeadEmail: 'lead@example.com',
        Participants: 'guest@example.com',
        SessionsJson: '',
        userName: 'Owner',
        placeName: 'Room 1',
        departmentName: 'Operations',
        participants: ['guest@example.com'],
        sessions: [
            {
                Name: 'Welcome',
                Type: 'Talk',
                StartDateTime: '2026-08-10T09:00',
                EndDateTime: '2026-08-10T10:30',
            },
            {
                Name: 'Practice',
                Type: 'Lab',
                StartDateTime: '2026-08-12T13:15',
                EndDateTime: '2026-08-12T15:00',
            },
        ],
        comments: [],
        ...overrides,
    }) as ProgramRequestDTO;

const user = (role: UserRole, email = 'owner@example.com'): UserDTO =>
    ({ Email: email, Name: 'User', Role: role, DepartmentId: 'dept-1' }) as UserDTO;

export function runProgramActionAssertions(): void {
    const source = request();
    const duplicate = buildDuplicateProgramInput(source, 'current@example.com');
    assert(duplicate.name === source.Name, 'duplicate should copy the program title');
    assert(duplicate.language === source.Language, 'duplicate should copy the language');
    assert(duplicate.type === source.Type, 'duplicate should copy the type');
    assert(duplicate.userId === 'current@example.com', 'duplicate should use current requester');
    assert(duplicate.placeId === '', 'duplicate should leave place blank');
    assert(duplicate.departmentId === source.DepartmentId, 'duplicate should copy department');
    assert(duplicate.leadEmail === source.LeadEmail, 'duplicate should copy lead email');
    assert(duplicate.participants === 'guest@example.com', 'duplicate should copy participants');
    assert(duplicate.sessions.length === source.sessions.length, 'duplicate should copy sessions');
    assert(
        duplicate.sessions[0].startDateTime === source.sessions[0].StartDateTime,
        'duplicate should copy session dates',
    );

    assert(
        canRescheduleProgram(source, user('admin')),
        'admins should always be able to reschedule',
    );
    assert(
        canRescheduleProgram(source, user('approver')),
        'approvers should always be able to reschedule',
    );
    assert(
        !canRescheduleProgram(source, user('user')),
        'users should not reschedule submitted requests',
    );
    assert(
        canRescheduleProgram({ ...source, Status: 'draft' }, user('user')),
        'owners should reschedule their drafts',
    );
    assert(
        canRescheduleProgram(
            { ...source, Status: 'draft', UserId: 'other@example.com' },
            user('user', 'guest@example.com'),
        ),
        'participants should reschedule drafts they can edit',
    );
    assert(
        !canRescheduleProgram({ ...source, Status: 'draft' }, user('user', 'other@example.com')),
        'non-owners should not reschedule another users draft',
    );

    assert(
        getProgramRequestActions({ ...source, Status: 'draft' }, user('admin')).join(',') ===
            'submit,cancel',
        'admins should see submit and cancel for draft programs',
    );
    assert(
        getProgramRequestActions({ ...source, Status: 'submitted' }, user('approver')).join(',') ===
            'approve,reject,cancel',
        'approvers should see every valid action for submitted programs',
    );
    assert(
        getProgramRequestActions(
            { ...source, Status: 'draft' },
            user('user', 'other@example.com'),
        ).join(',') === '',
        'users should not see actions for another users draft',
    );

    assert(
        getLocalDateFromSession(source.sessions[0].StartDateTime) === '2026-08-10',
        'first session date should use the local calendar date',
    );
    const shifted = shiftProgramSessions(source.sessions, '2026-08-13');
    assert(
        shifted[0].StartDateTime === '2026-08-13T09:00' &&
            shifted[0].EndDateTime === '2026-08-13T10:30',
        'reschedule should shift the first session forward and preserve its time',
    );
    assert(
        shifted[1].StartDateTime === '2026-08-15T13:15' &&
            shifted[1].EndDateTime === '2026-08-15T15:00',
        'reschedule should shift every session forward',
    );
    const shiftedBack = shiftProgramSessions(source.sessions, '2026-08-07');
    assert(
        shiftedBack[0].StartDateTime === '2026-08-07T09:00',
        'reschedule should shift sessions backward',
    );
    const unchanged = shiftProgramSessions(source.sessions, '2026-08-10');
    assert(
        unchanged[0].StartDateTime === source.sessions[0].StartDateTime &&
            unchanged[1].EndDateTime === source.sessions[1].EndDateTime,
        'same first-session date should leave sessions unchanged',
    );
}
