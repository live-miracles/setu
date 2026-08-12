import { formatTimeOfDay } from './format';

export interface RosterTableShift {
    roster: RosterDTO;
    color: string;
    startIndex: number;
    endIndex: number;
    laneIndex: number;
}

export interface RosterTableLane {
    shifts: RosterTableShift[];
}

export interface RosterTableVolunteer {
    userId: string;
    name: string;
    lanes: RosterTableLane[];
}

export interface RosterTableRow {
    isoDate: string;
    label: string;
}

export interface RosterTableModel {
    rows: RosterTableRow[];
    volunteers: RosterTableVolunteer[];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDateOnly(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (
        date.getFullYear() !== Number(match[1]) ||
        date.getMonth() !== Number(match[2]) - 1 ||
        date.getDate() !== Number(match[3])
    ) {
        return null;
    }
    return date;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function toIsoDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatRosterTableDate(dateIso: string): string {
    const date = parseDateOnly(dateIso);
    if (!date) return dateIso;
    return `${WEEKDAY_NAMES[date.getDay()]}, ${date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    })}`;
}

export function formatRosterTableTimes(roster: RosterDTO): string {
    const start = formatTimeOfDay(roster.StartTime);
    const end = formatTimeOfDay(roster.EndTime);
    return start && end ? `${start} – ${end}` : start || end;
}

export function getShiftTypeTimes(
    shiftTypes: ShiftType[],
    shiftTypeId: string,
): { startTime: string; endTime: string } | null {
    const shiftType = shiftTypes.find((candidate) => candidate.Id === shiftTypeId);
    return shiftType
        ? { startTime: shiftType.DefaultStartTime, endTime: shiftType.DefaultEndTime }
        : null;
}

function isValidColor(value: string): boolean {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function shiftSortValue(roster: RosterDTO): string {
    return `${roster.StartDate}T${roster.StartTime || '00:00'}|${roster.EndDate}T${roster.EndTime || '24:00'}|${roster.Name}|${roster.Id}`;
}

function rangesOverlap(first: RosterTableShift, secondStart: number, secondEnd: number): boolean {
    return secondStart <= first.endIndex && secondEnd >= first.startIndex;
}

export function buildRosterTableModel(
    rosters: RosterDTO[],
    shiftTypes: ShiftType[],
    todayIso: string,
): RosterTableModel {
    const today = parseDateOnly(todayIso);
    if (!today) return { rows: [], volunteers: [] };

    const eligible = rosters
        .map((roster) => {
            const start = parseDateOnly(roster.StartDate);
            const end = parseDateOnly(roster.EndDate);
            if (!start || !end || start > end || start < today) return null;
            return { roster, start, end };
        })
        .filter((entry): entry is { roster: RosterDTO; start: Date; end: Date } => entry !== null);

    if (!eligible.length) return { rows: [], volunteers: [] };

    const shiftColors = new Map(
        shiftTypes.map((shiftType) => [
            shiftType.Name.toLowerCase(),
            isValidColor(shiftType.Color || '') ? shiftType.Color.trim() : '',
        ]),
    );

    const lastDate = eligible.reduce(
        (latest, entry) => (entry.end > latest ? entry.end : latest),
        eligible[0].end,
    );
    const rows: RosterTableRow[] = [];
    const rowIndexByDate = new Map<string, number>();
    for (let date = today; date <= lastDate; date = addDays(date, 1)) {
        const isoDate = toIsoDate(date);
        rowIndexByDate.set(isoDate, rows.length);
        rows.push({ isoDate, label: formatRosterTableDate(isoDate) });
    }

    const grouped = new Map<string, { name: string; entries: typeof eligible }>();
    for (const entry of eligible) {
        const userId = entry.roster.UserId || entry.roster.userName || 'unassigned';
        const group = grouped.get(userId) || {
            name: entry.roster.userName || entry.roster.UserId || 'Unassigned',
            entries: [],
        };
        group.entries.push(entry);
        grouped.set(userId, group);
    }

    const volunteers = [...grouped.entries()]
        .sort(([, first], [, second]) => first.name.localeCompare(second.name))
        .map(([userId, group]) => {
            const lanes: RosterTableLane[] = [];
            [...group.entries]
                .sort((first, second) =>
                    shiftSortValue(first.roster).localeCompare(shiftSortValue(second.roster)),
                )
                .forEach((entry) => {
                    const startIndex = rowIndexByDate.get(toIsoDate(entry.start));
                    const endIndex = rowIndexByDate.get(toIsoDate(entry.end));
                    if (startIndex === undefined || endIndex === undefined) return;
                    const laneIndex = lanes.findIndex((lane) =>
                        lane.shifts.every((shift) => !rangesOverlap(shift, startIndex, endIndex)),
                    );
                    const selectedLane =
                        laneIndex === -1 ? lanes.push({ shifts: [] }) - 1 : laneIndex;
                    lanes[selectedLane].shifts.push({
                        roster: entry.roster,
                        color: shiftColors.get(entry.roster.Name.toLowerCase()) || '',
                        startIndex,
                        endIndex,
                        laneIndex: selectedLane,
                    });
                });
            return { userId, name: group.name, lanes };
        });

    return { rows, volunteers };
}
