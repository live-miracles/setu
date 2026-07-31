const ROSTER_PAGE_SIZE = 20;

function buildRosterShiftDTO(
    shift: RosterShift,
    profilesById: Record<string, Profile>,
): RosterShiftDTO {
    const assignee = profilesById[shift.AssigneeProfileId];
    return Object.assign({}, shift, { assigneeName: assignee ? assignee.Name : '' });
}

function listRosterShifts(page: number): Paginated<RosterShiftDTO> {
    requireUser();
    const profilesById = indexById(Tables.Profiles.readAll());
    const sorted = Tables.RosterShifts.readAll().sort((a, b) =>
        (b.StartDate + b.StartTime).localeCompare(a.StartDate + a.StartTime),
    );
    const dtos = sorted.map((shift) => buildRosterShiftDTO(shift, profilesById));
    return paginate(dtos, page, ROSTER_PAGE_SIZE);
}

function createRosterShift(input: CreateRosterShiftInput, requestId: string): RosterShiftDTO {
    requireAdmin();

    if (!input.startDate || !input.endDate) {
        throw new ValidationError('startDate and endDate are required.');
    }
    if (input.endDate < input.startDate) {
        throw new ValidationError('endDate must not be before startDate.');
    }
    if (
        input.endDate === input.startDate &&
        input.startTime &&
        input.endTime &&
        input.endTime <= input.startTime
    ) {
        throw new ValidationError('endTime must be after startTime.');
    }
    if (!input.shiftName || !input.shiftName.trim()) {
        throw new ValidationError('shiftName is required.');
    }

    if (!input.assigneeProfileId) throw new ValidationError('assigneeProfileId is required.');
    const assignee = Tables.Profiles.findById(input.assigneeProfileId);
    if (!assignee || assignee.Status !== 'active') {
        throw new ValidationError('assignee_not_active: ' + input.assigneeProfileId);
    }

    const { result: shift } = withLockedDedupe('roster:create', requestId, () => {
        return Tables.RosterShifts.insert({
            StartDate: input.startDate,
            EndDate: input.endDate,
            StartTime: input.startTime || '',
            EndTime: input.endTime || '',
            ShiftName: input.shiftName.trim(),
            AssigneeProfileId: assignee.Id,
        });
    });

    sendNotificationEmail(
        assignee.Id,
        'roster:' + shift.Id + ':assigned',
        'New shift scheduled',
        'You have been assigned to a shift on ' + shift.StartDate + '.',
        '?section=roster',
    );

    return Object.assign({}, shift, { assigneeName: assignee.Name });
}
