import {
    buildInventoryUpdate,
    buildProgramUpdate,
    inventoryFormValues,
    programFormValues,
} from './request-fields';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function throwsWith(work: () => unknown, expected: string, message: string): void {
    try {
        work();
    } catch (e) {
        assert(e instanceof Error && e.message === expected, message);
        return;
    }
    throw new Error(message);
}

const session = (name: string): ProgramSession => ({
    Name: name,
    Type: 'Talk',
    StartDateTime: '2031-02-01T09:00:00Z',
    EndDateTime: '2031-02-01T10:00:00Z',
});

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
    sessions: [session('Welcome')],
} as unknown as ProgramRequestDTO;

const inventory = {
    Name: 'Camera kit',
    UserId: 'owner@example.com',
    StartDate: '2031-01-01',
    EndDate: '2031-01-03',
    Status: 'draft',
    DepartmentId: 'dept-1',
    LeadEmail: 'lead@example.com',
    ImageId: 'image-1',
    participants: [],
    items: [
        {
            InventoryTypeId: 'type-1',
            Quantity: 2,
            Condition: '',
            itemName: 'Camera',
            labels: [{ Id: 'label-1' }, 'label-2'],
        },
    ],
} as unknown as InventoryRequestDTO;

export function runRequestFieldsAssertions(): void {
    // The edit form is seeded from the request each time it opens, so it picks up
    // what changed on the server since the page loaded.
    const reseeded = programFormValues({ ...program, PlaceId: 'room-9' });
    assert(reseeded.PlaceId === 'room-9', 'reopening the editor picks up a newer place');
    assert(
        programFormValues({ ...program, PlaceId: null }).PlaceId === '',
        'a request with no place seeds the "No place" choice',
    );
    assert(inventoryFormValues(inventory).EndDate === '2031-01-03', 'inventory form seeds dates');
    // Participants and the status are not form state: participants are edited in
    // place and the status only changes through workflow actions.
    for (const values of [programFormValues(program), inventoryFormValues(inventory)]) {
        assert(!('Participants' in values), 'form values carry no participants');
        assert(!('Status' in values), 'form values carry no status');
    }

    // A save of one part sends the rest from the loaded request, so another user's
    // change to a field this person never touched is not reverted.
    const sessions = [session('Welcome'), session('Practice')];
    const sessionsUpdate = buildProgramUpdate(program, { sessions });
    assert(sessionsUpdate.placeId === 'room-2', 'session saves keep the loaded place');
    assert(
        sessionsUpdate.participants === 'a@example.com, b@example.com',
        'participants are sent comma separated',
    );
    assert(sessionsUpdate.sessions.length === 2, 'session saves send the new sessions');
    assert(sessionsUpdate.sessions[1].name === 'Practice', 'sessions use the input shape');
    assert(!('status' in sessionsUpdate), 'a program update never carries a status');
    assert(
        buildProgramUpdate(program).sessions.length === 1,
        'without changes the loaded sessions are sent',
    );

    // The edit form replaces the form fields and still takes the rest from the request.
    const edited = buildProgramUpdate(
        { ...program, participants: ['c@example.com'] },
        { values: { ...programFormValues(program), Name: 'Renamed', PlaceId: '' } },
    );
    assert(edited.name === 'Renamed' && edited.placeId === '', 'form values are sent');
    assert(edited.participants === 'c@example.com', 'participants come from the loaded request');
    throwsWith(
        () => buildProgramUpdate(program, { values: { ...programFormValues(program), Type: '' } }),
        'Type is required.',
        'the form needs a type',
    );
    throwsWith(
        () =>
            buildProgramUpdate(program, {
                values: { ...programFormValues(program), DepartmentId: '' },
            }),
        'Department is required.',
        'the form needs a department',
    );
    assert(
        buildProgramUpdate({ ...program, DepartmentId: '' }).departmentId === '',
        'a session save does not insist on form-only rules',
    );

    const itemsUpdate = buildInventoryUpdate(inventory);
    assert(itemsUpdate.items[0].quantity === 2, 'items come from the loaded request');
    assert(
        itemsUpdate.items[0].labelIds?.join(',') === 'label-1,label-2',
        'label objects and ids both become ids',
    );
    assert(!('imageId' in itemsUpdate), 'an image is only sent when it changes');
    assert(
        buildInventoryUpdate(inventory, { imageId: 'image-2' }).imageId === 'image-2',
        'a new image is sent',
    );
    assert(
        buildInventoryUpdate(inventory, { items: [] }).items.length === 0,
        'a changed list replaces the items',
    );
    throwsWith(
        () =>
            buildInventoryUpdate(inventory, {
                values: { ...inventoryFormValues(inventory), UserId: '' },
            }),
        'Requested by is required.',
        'the form needs a requester',
    );
}
