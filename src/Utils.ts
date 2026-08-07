class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}
class AuthorizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthorizationError';
    }
}
class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}
class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}

function nowIso(): string {
    return new Date().toISOString();
}

function toBool(value: unknown): boolean {
    return value === true || value === 'true' || value === 'TRUE' || value === 1 || value === '1';
}

function escapeHtml(value: unknown): string {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Takes a keyFn (like groupBy below) rather than assuming an `Id` field,
// since Users is keyed by Email instead — see SheetTable.ts's keyColumn.
function indexBy<T>(rows: T[], keyFn: (row: T) => string): Record<string, T> {
    const map: Record<string, T> = {};
    rows.forEach((row) => {
        map[keyFn(row)] = row;
    });
    return map;
}

function groupBy<T, K extends string>(rows: T[], keyFn: (row: T) => K): Record<K, T[]> {
    const map = {} as Record<K, T[]>;
    rows.forEach((row) => {
        const key = keyFn(row);
        if (!map[key]) map[key] = [];
        map[key].push(row);
    });
    return map;
}

function paginate<T>(
    rows: T[],
    page: number,
    pageSize: number,
): { items: T[]; page: number; pageSize: number; totalCount: number } {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const start = (safePage - 1) * pageSize;
    return {
        items: rows.slice(start, start + pageSize),
        page: safePage,
        pageSize,
        totalCount: rows.length,
    };
}

function normalizedSearch(value: unknown): string {
    return String(value == null ? '' : value)
        .trim()
        .toLocaleLowerCase();
}

function matchesSearch(query: string | undefined, values: unknown[]): boolean {
    const needles = String(query || '')
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!needles.length) return true;
    return needles.every((needle) =>
        values.some((value) => normalizedSearch(value).indexOf(needle) !== -1),
    );
}

function compareQueryValues(left: unknown, right: unknown, direction: SortDirection): number {
    const result = String(left == null ? '' : left).localeCompare(
        String(right == null ? '' : right),
        undefined,
        { numeric: true, sensitivity: 'base' },
    );
    return direction === 'asc' ? result : -result;
}

function requireNonEmpty(value: string, message: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) throw new ValidationError(message);
    return trimmed;
}

function requireMinLength(value: string, min: number, message: string): string {
    const trimmed = String(value || '').trim();
    if (trimmed.length < min) throw new ValidationError(message);
    return trimmed;
}

// Participants is stored as one comma-separated cell (see InventoryRequest/
// ProgramRequest in shared/types.d.ts) rather than a child table — trimmed,
// lowercased and deduped on write so membership checks are plain string
// equality against Session.getActiveUser().getEmail().
function parseParticipants(raw: string): string[] {
    const seen = new Set<string>();
    String(raw || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0)
        .forEach((email) => seen.add(email));
    return Array.from(seen);
}

function formatParticipants(emails: string[]): string {
    return parseParticipants(emails.join(',')).join(', ');
}

function parseInventoryItemsJson(raw: string): InventoryItem[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item) => ({
            InventoryTypeId: String(item.InventoryTypeId || item.inventoryTypeId || ''),
            Quantity: Number(item.Quantity || item.quantity || 0),
            Condition: (item.Condition || item.condition || '') as ReturnCondition | '',
        }));
    } catch (err) {
        return [];
    }
}

function stringifyInventoryItems(items: InventoryItem[]): string {
    return JSON.stringify(
        items.map((item) => ({
            InventoryTypeId: item.InventoryTypeId,
            Quantity: item.Quantity,
            Condition: item.Condition || '',
        })),
    );
}

function parseProgramSessionsJson(raw: string): ProgramSession[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((session) => ({
            Name: String(session.Name || session.name || ''),
            Type: String(session.Type || session.type || ''),
            StartDateTime: String(session.StartDateTime || session.startDateTime || ''),
            EndDateTime: String(session.EndDateTime || session.endDateTime || ''),
        }));
    } catch (err) {
        return [];
    }
}

function stringifyProgramSessions(sessions: ProgramSession[]): string {
    return JSON.stringify(
        sessions.map((session) => ({
            Name: session.Name || '',
            Type: session.Type,
            StartDateTime: session.StartDateTime,
            EndDateTime: session.EndDateTime,
        })),
    );
}
