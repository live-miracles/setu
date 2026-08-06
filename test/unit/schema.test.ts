import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tableSource = readFileSync(new URL('../../src/SheetTable.ts', import.meta.url), 'utf8');
const setupSource = readFileSync(new URL('../../src/Setup.ts', import.meta.url), 'utf8');

describe('append-only Sheets schema v2', () => {
    it('keeps legacy Ticket columns as an unchanged prefix', () => {
        expect(tableSource).toContain(
            "'Title',\n        'Description',\n        'Status',\n        'AssigneeId',\n        'ReporterId',",
        );
    });

    it('appends TicketId after all legacy Comment columns', () => {
        expect(tableSource).toContain("'UserId',\n        'Message',\n        'TicketId',");
    });

    it('backs up before migration and fails on unsafe header drift', () => {
        expect(setupSource.indexOf('.makeCopy(')).toBeLessThan(
            setupSource.indexOf('setupSheets();'),
        );
        expect(setupSource).toContain('Unsafe schema mismatch');
        expect(setupSource).toContain("CURRENT_SCHEMA_VERSION = '2'");
    });
});
