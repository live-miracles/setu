export type CreateRecordKind = 'inventory' | 'programs' | 'tickets';

export function createRecordDestination(kind: CreateRecordKind, id: string): string {
    return id;
}
