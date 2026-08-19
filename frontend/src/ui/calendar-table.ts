const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface CalendarSessionLine {
    label: string;
    startDateTime: string;
}

export interface CalendarProgramBlock {
    programId: string;
    title: string;
    sessions: CalendarSessionLine[];
    color: string;
}

export interface CalendarTablePlace {
    placeId: string;
    name: string;
    blocks: CalendarProgramBlock[];
}

export interface CalendarTableRow {
    isoDate: string;
    label: string;
    places: CalendarTablePlace[];
}

export interface CalendarTableModel {
    rows: CalendarTableRow[];
    places: Place[];
}

function parseDateOnly(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) &&
        date.getMonth() === Number(match[2]) - 1 &&
        date.getDate() === Number(match[3])
        ? date
        : null;
}

function dateFromDateTime(value: string): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDate(isoDate: string): string {
    const date = parseDateOnly(isoDate);
    if (!date) return isoDate;
    return `${WEEKDAY_NAMES[date.getDay()]}, ${date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    })}`;
}

function formatTime(value: string): string {
    const date = dateFromDateTime(value);
    if (!date) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function sessionDate(session: ProgramSession): string | null {
    const date = dateFromDateTime(session.StartDateTime);
    return date ? toIsoDate(date) : null;
}

function sessionSortValue(session: ProgramSession): string {
    return `${session.StartDateTime}|${session.EndDateTime}|${session.Type}|${session.Name}`;
}

function isValidColor(value: string): boolean {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function programTitle(program: ProgramRequestDTO): string {
    return [
        program.Language,
        program.Type.toLowerCase() === 'other' ? '' : program.Type,
        program.Name,
    ]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(' ');
}

function sessionLabel(session: ProgramSession): string {
    const timing = [formatTime(session.StartDateTime), formatTime(session.EndDateTime)]
        .filter(Boolean)
        .join(' - ');
    return [timing, session.Type, session.Name].filter((value) => value.trim()).join(' ');
}

export function buildCalendarTableModel(
    programs: ProgramRequestDTO[],
    places: Place[],
    programTypes: ProgramType[],
    todayIso: string,
    monthStartIso?: string,
    monthEndIso?: string,
): CalendarTableModel {
    const today = parseDateOnly(todayIso);
    const sortedPlaces = [...places].sort((a, b) => a.Name.localeCompare(b.Name));
    if (!today) return { rows: [], places: sortedPlaces };

    const typeColors = new Map(
        programTypes.map((type) => [type.Name.toLowerCase(), type.Color || '']),
    );
    const approved = programs.filter((program) => program.Status === 'approved');
    const visibleSessions = approved.flatMap((program) =>
        program.sessions.filter((session) => {
            const date = sessionDate(session);
            return Boolean(
                date &&
                (!monthStartIso || date >= monthStartIso) &&
                (!monthEndIso || date <= monthEndIso) &&
                (monthStartIso || date >= todayIso),
            );
        }),
    );
    if (!visibleSessions.length) return { rows: [], places: sortedPlaces };

    const lastDate = visibleSessions.reduce((latest, session) => {
        const date = sessionDate(session);
        return date && date > latest ? date : latest;
    }, monthEndIso || todayIso);
    const firstDate = monthStartIso ? parseDateOnly(monthStartIso)! : addDays(today, -2);
    const rows: CalendarTableRow[] = [];
    for (let date = firstDate; toIsoDate(date) <= lastDate; date = addDays(date, 1)) {
        const isoDate = toIsoDate(date);
        const rowPlaces = sortedPlaces.map((place) => {
            const blocks = approved
                .map((program) => {
                    const sessions = program.sessions
                        .filter(
                            (session) =>
                                sessionDate(session) === isoDate && program.PlaceId === place.Id,
                        )
                        .sort((a, b) => sessionSortValue(a).localeCompare(sessionSortValue(b)));
                    if (!sessions.length) return null;
                    const configuredColor = typeColors.get(program.Type.toLowerCase()) || '';
                    return {
                        programId: program.Id,
                        title: programTitle(program),
                        sessions: sessions.map((session) => ({
                            label: sessionLabel(session),
                            startDateTime: session.StartDateTime,
                        })),
                        color:
                            program.Type.toLowerCase() === 'other' || !isValidColor(configuredColor)
                                ? ''
                                : configuredColor.trim(),
                    };
                })
                .filter((block): block is CalendarProgramBlock => block !== null)
                .sort((a, b) =>
                    `${a.sessions[0].startDateTime}|${a.programId}`.localeCompare(
                        `${b.sessions[0].startDateTime}|${b.programId}`,
                    ),
                );
            return { placeId: place.Id, name: place.Name, blocks };
        });
        rows.push({ isoDate, label: formatDate(isoDate), places: rowPlaces });
    }
    return { rows, places: sortedPlaces };
}
