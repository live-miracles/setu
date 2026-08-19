const ONE_HOUR_MS = 60 * 60 * 1000;

function placeAllowsOverlap(place: Place): boolean {
    return (
        place.AllowOverlap === true ||
        ['true', 'yes', '1'].includes(String(place.AllowOverlap).toLowerCase())
    );
}

function sessionsAreTooClose(left: ProgramSession, right: ProgramSession): boolean {
    const leftStart = Date.parse(left.StartDateTime);
    const leftEnd = Date.parse(left.EndDateTime);
    const rightStart = Date.parse(right.StartDateTime);
    const rightEnd = Date.parse(right.EndDateTime);
    if ([leftStart, leftEnd, rightStart, rightEnd].some(Number.isNaN)) return false;
    return leftStart < rightEnd + ONE_HOUR_MS && rightStart < leftEnd + ONE_HOUR_MS;
}

export function availablePlacesForSessions(
    places: Place[],
    programs: ProgramRequestDTO[],
    sessions: ProgramSession[],
    currentProgramId?: string,
): Place[] {
    if (!sessions.length) return places;
    return places.filter((place) => {
        if (placeAllowsOverlap(place)) return true;
        return !programs.some(
            (program) =>
                program.Id !== currentProgramId &&
                program.Status === 'approved' &&
                program.PlaceId === place.Id &&
                program.sessions.some((otherSession) =>
                    sessions.some((session) => sessionsAreTooClose(session, otherSession)),
                ),
        );
    });
}
