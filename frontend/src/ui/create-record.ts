export type CreateRecordKind = 'inventory' | 'programs';

export function createRecordDestination(kind: CreateRecordKind, id: string): string {
    return id;
}
