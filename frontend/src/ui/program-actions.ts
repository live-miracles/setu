import { canApprove, canTransitionProgramRequest } from '../workflows';
import { localDateToDayNumber, toIsoDate } from './date';

function shiftLocalDateTime(value: string, dayDelta: number): string {
    getLocalDateFromSession(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value);
    if (!match) throw new Error('A valid session date is required.');
    const shifted = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    shifted.setDate(shifted.getDate() + dayDelta);
    return toIsoDate(shifted) + match[4];
}

export function buildDuplicateProgramInput(
    request: ProgramRequestDTO,
    currentUserEmail: string,
    sessions = request.sessions,
): CreateProgramRequestInput {
    return {
        name: request.Name,
        language: request.Language,
        type: request.Type,
        userId: currentUserEmail,
        placeId: '',
        sessions: sessions.map((session) => ({
            name: session.Name,
            type: session.Type,
            startDateTime: session.StartDateTime,
            endDateTime: session.EndDateTime,
        })),
        departmentId: request.DepartmentId,
        leadEmail: request.LeadEmail,
        participants: request.participants.join(', '),
    };
}

export function canRescheduleProgram(request: ProgramRequestDTO, me: UserDTO): boolean {
    const isOwner = request.UserId === me.Email || request.participants.includes(me.Email);
    return me.Role === 'admin' || me.Role === 'approver' || (request.Status === 'draft' && isOwner);
}

function canCancelProgram(request: ProgramRequestDTO): boolean {
    if (request.Status !== 'approved' || !request.sessions.length) return true;
    return request.sessions.some((session) => Date.parse(session.EndDateTime) >= Date.now());
}

export function getProgramRequestActions(
    request: ProgramRequestDTO,
    me: UserDTO,
): ProgramRequestAction[] {
    if (canApprove(me)) {
        return (['submit', 'approve', 'reject', 'cancel'] as ProgramRequestAction[]).filter(
            (action) =>
                canTransitionProgramRequest(request.Status, action) &&
                (action !== 'approve' || Boolean(request.PlaceId)) &&
                (action !== 'cancel' || canCancelProgram(request)),
        );
    }
    const isOwner = request.UserId === me.Email || request.participants.includes(me.Email);
    return request.Status === 'draft' && isOwner ? ['submit'] : [];
}

export function getLocalDateFromSession(startDateTime: string): string {
    const date = startDateTime.slice(0, 10);
    localDateToDayNumber(date);
    return date;
}

export function shiftProgramSessions(
    sessions: ProgramSession[],
    targetFirstDate: string,
): ProgramSession[] {
    if (!sessions.length) return [];
    const currentFirstDate = getLocalDateFromSession(sessions[0].StartDateTime);
    const dayDelta =
        (localDateToDayNumber(targetFirstDate) - localDateToDayNumber(currentFirstDate)) /
        (24 * 60 * 60 * 1000);
    return sessions.map((session) => ({
        ...session,
        StartDateTime: shiftLocalDateTime(session.StartDateTime, dayDelta),
        EndDateTime: shiftLocalDateTime(session.EndDateTime, dayDelta),
    }));
}
