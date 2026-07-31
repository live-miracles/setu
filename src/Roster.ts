const ROSTER_PAGE_SIZE = 20;

function buildRosterShiftDTO(
    shift: RosterShift,
    assignmentsByShift: Record<string, RosterAssignment[]>,
    profilesById: Record<string, Profile>,
): RosterShiftDTO {
    const assignees = (assignmentsByShift[shift.Id] || [])
        .map((a) => profilesById[a.ProfileId])
        .filter((p): p is Profile => !!p)
        .map((p) => ({ Id: p.Id, Name: p.Name, Email: p.Email }));
    return Object.assign({}, shift, { assignees });
}

function listRosterShifts(page: number): Paginated<RosterShiftDTO> {
    requireUser();
    const assignmentsByShift = groupBy(Tables.RosterAssignments.readAll(), (a) => a.ShiftId);
    const profilesById = indexById(Tables.Profiles.readAll());
    const sorted = Tables.RosterShifts.readAll().sort((a, b) =>
        b.StartsAt.localeCompare(a.StartsAt),
    );
    const dtos = sorted.map((shift) =>
        buildRosterShiftDTO(shift, assignmentsByShift, profilesById),
    );
    return paginate(dtos, page, ROSTER_PAGE_SIZE);
}

function createRosterShift(input: CreateRosterShiftInput, requestId: string): RosterShiftDTO {
    const actor = requireAdmin();

    if (!input.startsAt || !input.endsAt || input.endsAt <= input.startsAt) {
        throw new ValidationError('endsAt must be after startsAt.');
    }
    const location = Tables.Locations.findById(input.locationId);
    if (!location) throw new ValidationError('location_not_found');

    const assigneeIds = Array.from(new Set(input.assigneeProfileIds || []));
    const assignees = assigneeIds.map((id) => {
        const p = Tables.Profiles.findById(id);
        if (!p || p.Status !== 'active') throw new ValidationError('assignee_not_active: ' + id);
        return p;
    });

    const { result: shift } = withLockedDedupe('roster:create', requestId, () => {
        const created = Tables.RosterShifts.insert({
            StartsAt: input.startsAt,
            EndsAt: input.endsAt,
            Period: input.period,
            LocationId: input.locationId,
            LocationName: location.Name,
            Notes: input.notes || '',
            CreatedBy: actor.Id,
            CreatedAt: nowIso(),
            UpdatedAt: nowIso(),
        });
        assignees.forEach((p) => {
            Tables.RosterAssignments.insert({
                ShiftId: created.Id,
                ProfileId: p.Id,
                CreatedAt: nowIso(),
            });
        });
        logActivity(actor.Id, 'roster_shift', created.Id, 'create', null, created, { assigneeIds });
        return created;
    });

    assignees.forEach((p) => {
        enqueueNotification(
            p.Id,
            'roster:' + shift.Id + ':assigned',
            'New shift scheduled',
            'You have been assigned to a shift on ' + shift.StartsAt + '.',
            '?section=roster',
        );
    });

    return Object.assign({}, shift, {
        assignees: assignees.map((p) => ({ Id: p.Id, Name: p.Name, Email: p.Email })),
    });
}
