import { formatProgramSessionSchedule } from './format';

// How a request's activity events read on screen. The database records an edit
// as the fields that changed (see 20261128000000_activity_events.sql); this
// turns that structure into the lines the Activity card shows.

export type ChangeView =
    | { kind: 'value'; field: string; from: string; to: string }
    | { kind: 'list'; field: string; added: string[]; removed: string[] };

const NONE = 'none';

function entryText(entry: EditChangeEntry): string {
    const schedule =
        entry.startAt && entry.endAt
            ? formatProgramSessionSchedule(entry.startAt, entry.endAt)
            : '';
    return schedule ? `${entry.label} · ${schedule}` : entry.label;
}

function listText(entries: EditChangeEntry[] | undefined, more: number | undefined): string[] {
    const lines = (entries || []).map(entryText);
    if (more && more > 0) lines.push(`${more} more`);
    return lines;
}

export function describeChange(change: EditChange): ChangeView {
    if (change.added || change.removed) {
        return {
            kind: 'list',
            field: change.field,
            added: listText(change.added, change.moreAdded),
            removed: listText(change.removed, change.moreRemoved),
        };
    }
    return {
        kind: 'value',
        field: change.field,
        from: change.from || NONE,
        to: change.to || NONE,
    };
}

/** The edit event's changes, or none when the event carries no usable data. */
export function editChanges(data: CommentRecord['Data']): ChangeView[] {
    const changes = (data as EditEventData | null)?.changes;
    return Array.isArray(changes) ? changes.map(describeChange) : [];
}

/** The status event's old status, new status and note, or undefined without data. */
export function statusEvent(
    data: CommentRecord['Data'],
): { from: string; to: string; note: string } | undefined {
    const status = data as StatusEventData | null;
    if (!status?.to) return undefined;
    return { from: status.from || '', to: status.to, note: (status.note || '').trim() };
}
