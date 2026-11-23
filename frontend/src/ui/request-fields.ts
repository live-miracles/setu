// The detail pages save a request by sending the whole row back to the API
// (there is no partial update). Every save is built here from the freshly
// loaded request plus the one thing the person changed, never from state the
// page captured when it opened: that would silently revert anything another
// user (for example an approver assigning the place) changed in the meantime.
// The status is not part of an update: it only changes through workflow actions.

// The edit form's own state. Participants are not in it: they are edited in
// place on the page and always come from the loaded request.
export interface InventoryFormValues {
    Name: string;
    StartDate: string;
    EndDate: string;
    DepartmentId: string;
    LeadEmail: string;
    UserId: string;
}

export interface ProgramFormValues {
    Name: string;
    Language: string;
    Type: string;
    PlaceId: string;
    DepartmentId: string;
    LeadEmail: string;
    UserId: string;
}

// Seeded from the request each time the editor opens, so a cancelled edit, or a
// change made by someone else while the page was open, never leaks into the next
// save.
export function inventoryFormValues(request: InventoryRequestDTO): InventoryFormValues {
    return {
        Name: request.Name,
        StartDate: request.StartDate,
        EndDate: request.EndDate,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        UserId: request.UserId,
    };
}

export function programFormValues(request: ProgramRequestDTO): ProgramFormValues {
    return {
        Name: request.Name,
        Language: request.Language,
        Type: request.Type,
        PlaceId: request.PlaceId ?? '',
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        UserId: request.UserId,
    };
}

// The API takes participants as one comma-separated string.
export function serializeParticipants(participants: string[]): string {
    return participants.join(', ');
}

function requireValue(value: string, message: string): void {
    if (!value) throw new Error(message);
}

// What a save changes: the edit form's values, or the lines or image that were
// changed on their own. Anything left out keeps the loaded request's value.
export function buildInventoryUpdate(
    request: InventoryRequestDTO,
    changes: { values?: InventoryFormValues; items?: InventoryItemDTO[]; imageId?: string } = {},
): UpdateInventoryRequestInput {
    const values = changes.values ?? inventoryFormValues(request);
    if (changes.values) {
        requireValue(values.UserId, 'Requested by is required.');
        requireValue(values.DepartmentId, 'Department is required.');
    }
    return {
        name: values.Name,
        userId: values.UserId,
        startDate: values.StartDate,
        endDate: values.EndDate,
        departmentId: values.DepartmentId,
        leadEmail: values.LeadEmail,
        participants: serializeParticipants(request.participants),
        items: toInventoryItemInputs(changes.items ?? request.items),
        ...(changes.imageId === undefined ? {} : { imageId: changes.imageId }),
    };
}

export function buildProgramUpdate(
    request: ProgramRequestDTO,
    changes: { values?: ProgramFormValues; sessions?: ProgramSession[] } = {},
): UpdateProgramRequestInput {
    const values = changes.values ?? programFormValues(request);
    if (changes.values) {
        requireValue(values.Language, 'Language is required.');
        requireValue(values.Type, 'Type is required.');
        requireValue(values.UserId, 'Requested by is required.');
        requireValue(values.DepartmentId, 'Department is required.');
    }
    return {
        name: values.Name,
        language: values.Language,
        type: values.Type,
        userId: values.UserId,
        placeId: values.PlaceId,
        departmentId: values.DepartmentId,
        leadEmail: values.LeadEmail,
        participants: serializeParticipants(request.participants),
        sessions: toProgramSessionInputs(changes.sessions ?? request.sessions),
    };
}

// The API takes sessions and item lines in their own input shapes; every page
// that saves a request maps its state through these, not by hand.
export function toProgramSessionInputs(sessions: ProgramSession[]) {
    return sessions.map((session) => ({
        name: session.Name,
        type: session.Type,
        startDateTime: session.StartDateTime,
        endDateTime: session.EndDateTime,
    }));
}

export function toInventoryItemInputs(items: InventoryItemDTO[]) {
    return items.map((item) => ({
        inventoryTypeId: item.InventoryTypeId,
        quantity: item.Quantity,
        condition: item.Condition,
        labelIds: (item.labels || []).map((label) =>
            typeof label === 'string' ? label : label.Id,
        ),
    }));
}
