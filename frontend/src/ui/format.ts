// Value -> display string. No DOM access and no HTML structure, so these
// stay safe to call from anywhere, including inside template literals.

// Mandatory anywhere untrusted strings (ticket titles/descriptions/comments,
// request names, admin notes, names) get interpolated into innerHTML-built
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

// Formats a plain 'YYYY-MM-DD' string without Date conversion, which would
// risk shifting the displayed day for viewers west of UTC.
function formatDateOnly(dateStr: string): string {
    const parts = (dateStr || '').split('-');
    if (parts.length !== 3) return dateStr || '';
    const [year, month, day] = parts;
    const monthIdx = Number(month) - 1;
    if (monthIdx < 0 || monthIdx > 11 || isNaN(Number(day))) return dateStr;
    return `${MONTH_SHORT_NAMES[monthIdx]} ${Number(day)}, ${year}`;
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
