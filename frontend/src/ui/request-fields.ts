// Detail pages persist a session/item/image change by sending the whole
// request back to the API. The untouched fields must come from the freshly
// loaded request, not from the page's form state: that state is captured when
// the page opens, so reusing it silently reverts anything another user (for
// example an approver assigning the place) changed in the meantime.

export function inventoryRequestFields(request: InventoryRequestDTO) {
    return {
        name: request.Name,
        userId: request.UserId,
        startDate: request.StartDate,
        endDate: request.EndDate,
        departmentId: request.DepartmentId,
        leadEmail: request.LeadEmail,
        participants: request.participants.join(', '),
    };
}

export function programRequestFields(request: ProgramRequestDTO) {
    return {
        name: request.Name,
        language: request.Language,
        type: request.Type,
        userId: request.UserId,
        placeId: request.PlaceId,
        departmentId: request.DepartmentId,
        leadEmail: request.LeadEmail,
        participants: request.participants.join(', '),
        status: request.Status,
    };
}

// Edit-form state seeded from a request. Detail pages reseed it whenever the
// editor opens so a cancelled edit, or a change made by someone else while the
// page was open, never leaks into the next save.
export function inventoryFormValues(request: InventoryRequestDTO) {
    return {
        Name: request.Name,
        StartDate: request.StartDate,
        EndDate: request.EndDate,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        Participants: request.participants.join(', '),
        UserId: request.UserId,
    };
}

export function programFormValues(request: ProgramRequestDTO) {
    return {
        Name: request.Name,
        Language: request.Language,
        Type: request.Type,
        PlaceId: request.PlaceId,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        Participants: request.participants.join(', '),
        UserId: request.UserId,
        Status: request.Status,
    };
}
