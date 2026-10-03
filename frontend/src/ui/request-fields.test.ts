import {
    inventoryFormValues,
    inventoryRequestFields,
    programFormValues,
    programRequestFields,
} from './request-fields';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runRequestFieldsAssertions(): void {
    const program = {
        Name: 'Orientation',
        Language: 'English',
        Type: 'Workshop',
        UserId: 'owner@example.com',
        Status: 'submitted',
        PlaceId: 'room-2',
        DepartmentId: 'dept-1',
        LeadEmail: 'lead@example.com',
        participants: ['a@example.com', 'b@example.com'],
    } as unknown as ProgramRequestDTO;
    const programFields = programRequestFields(program);
    assert(programFields.placeId === 'room-2', 'program fields use the loaded place');
    assert(programFields.status === 'submitted', 'program fields use the loaded status');
    assert(
        programFields.participants === 'a@example.com, b@example.com',
        'program participants are comma separated',
    );

    const inventory = {
        Name: 'Camera kit',
        UserId: 'owner@example.com',
        StartDate: '2031-01-01',
        EndDate: '2031-01-03',
        DepartmentId: 'dept-1',
        LeadEmail: 'lead@example.com',
        participants: [],
    } as unknown as InventoryRequestDTO;
    const inventoryFields = inventoryRequestFields(inventory);
    assert(inventoryFields.startDate === '2031-01-01', 'inventory fields use the loaded dates');
    assert(inventoryFields.participants === '', 'empty participants serialize to an empty string');

    const reseeded = programFormValues({ ...program, PlaceId: 'room-9' } as ProgramRequestDTO);
    assert(reseeded.PlaceId === 'room-9', 'reopening the editor picks up a newer place');
    assert(reseeded.Participants === 'a@example.com, b@example.com', 'form participants match');
    assert(inventoryFormValues(inventory).EndDate === '2031-01-03', 'inventory form seeds dates');
}
