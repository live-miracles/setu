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
