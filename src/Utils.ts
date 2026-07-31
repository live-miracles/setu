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

function indexById<T extends { Id: string }>(rows: T[]): Record<string, T> {
    const map: Record<string, T> = {};
    rows.forEach((row) => {
        map[row.Id] = row;
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

function logActivity(
    actorId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
    metadata: unknown,
): ActivityLogEntry {
    return Tables.ActivityLog.insert({
        Timestamp: nowIso(),
        ActorId: actorId,
        EntityType: entityType,
        EntityId: entityId,
        Action: action,
        BeforeJson: before == null ? '' : JSON.stringify(before),
        AfterJson: after == null ? '' : JSON.stringify(after),
        MetadataJson: metadata == null ? '' : JSON.stringify(metadata),
    });
}
