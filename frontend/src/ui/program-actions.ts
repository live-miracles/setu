import { getRequestPermissions } from '../workflows';
import { localDateToDayNumber, toIsoDate } from './date';
import { toProgramSessionInputs } from './request-fields';

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
        sessions: toProgramSessionInputs(sessions),
        departmentId: request.DepartmentId,
        leadEmail: request.LeadEmail,
        participants: request.participants.join(', '),
    };
}

export function canRescheduleProgram(request: ProgramRequestDTO, me: UserDTO): boolean {
    return getRequestPermissions('program', request, me).canEdit;
}

export function getLocalDateFromSession(startDateTime: string): string {
    // The stored instant's own date can differ from the viewer's local date
    // (e.g. 00:00 IST is the previous day in UTC), so read it in local time.
    const parsed = new Date(startDateTime);
    const date = Number.isNaN(parsed.getTime()) ? startDateTime.slice(0, 10) : toIsoDate(parsed);
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
