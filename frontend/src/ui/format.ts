// Value -> display string. No DOM access and no HTML structure, so these
// stay safe to call from anywhere, including inside template literals.

// Mandatory anywhere untrusted strings (request names/descriptions/comments,
// admin notes, names) get interpolated into innerHTML-built
// templates — fixes a known XSS gap in the multi-lang-qa reference pattern
// rather than reproducing it.
export function escapeHtml(value: unknown): string {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export const MONTH_SHORT_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

function formatDateOnly(dateStr: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return dateStr || '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTimeOfDay(time: string): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function formatRosterSchedule(roster: {
    StartDate: string;
    EndDate: string;
    StartTime: string;
    EndTime: string;
}): string {
    const dateLabel =
        roster.StartDate === roster.EndDate
            ? formatDateOnly(roster.StartDate)
            : `${formatDateOnly(roster.StartDate)} – ${formatDateOnly(roster.EndDate)}`;
    const startTime = formatTimeOfDay(roster.StartTime);
    const endTime = formatTimeOfDay(roster.EndTime);
    const timeLabel = startTime && endTime ? `${startTime} – ${endTime}` : startTime || endTime;
    return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

export function formatDateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function formatProgramSessionSchedule(startIso: string, endIso: string): string {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return [formatDateTime(startIso), formatDateTime(endIso)].filter(Boolean).join(' – ');
    }

    const dateLabel = (date: Date) =>
        new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
        }).format(date);
    const startTime = formatTimeOfDay(
        `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    );
    const endTime = formatTimeOfDay(
        `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
    );

    if (start.toDateString() === end.toDateString()) {
        return `${startTime} - ${endTime}, ${dateLabel(start)}`;
    }
    return `${startTime}, ${dateLabel(start)} - ${endTime}, ${dateLabel(end)}`;
}

export function formatProgramDateRange(sessions: ProgramSession[]): string {
    const dates = sessions
        .flatMap((session) => [session.StartDateTime, session.EndDateTime])
        .map((value) => new Date(value))
        .filter((date) => !isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());
    if (!dates.length) return 'No dates scheduled';

    const first = dates[0];
    const last = dates[dates.length - 1];
    const format = (date: Date) => ({
        day: date.getDate(),
        month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
        year: date.getFullYear(),
    });
    const start = format(first);
    const end = format(last);
    if (start.day === end.day && start.month === end.month && start.year === end.year)
        return `${start.day} ${start.month}, ${start.year}`;
    if (start.month === end.month && start.year === end.year)
        return `${start.day} - ${end.day} ${end.month}, ${end.year}`;
    if (start.year === end.year)
        return `${start.day} ${start.month} - ${end.day} ${end.month}, ${end.year}`;
    return `${start.day} ${start.month}, ${start.year} - ${end.day} ${end.month}, ${end.year}`;
}

export function formatProgramDateRangeFromBounds(start: string, end: string): string {
    if (!start || !end) return 'No dates scheduled';
    return formatProgramDateRange([{ Name: '', Type: '', StartDateTime: start, EndDateTime: end }]);
}
