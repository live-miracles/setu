const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseDateOnly(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) &&
        date.getMonth() === Number(match[2]) - 1 &&
        date.getDate() === Number(match[3])
        ? date
        : null;
}

export function toIsoDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatLocalDateOnly(date: Date): string {
    return toIsoDate(date);
}

export function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export function formatWeekdayDate(dateIso: string): string {
    const date = parseDateOnly(dateIso);
    if (!date) return dateIso;
    return `${WEEKDAY_NAMES[date.getDay()]}, ${date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    })}`;
}

export function formatDateTimeLocal(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateToDayNumber(date: string): number {
    const value = parseDateOnly(date);
    if (!value) throw new Error('A valid date is required.');
    return value.getTime();
}

export function isValidHexColor(value: string): boolean {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}
