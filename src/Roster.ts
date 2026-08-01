const ROSTER_PAGE_SIZE = 20;

function buildRosterDTO(roster: Roster, usersByEmail: Record<string, User>): RosterDTO {
    const user = usersByEmail[roster.UserId];
    return Object.assign({}, roster, { userName: user ? user.Name : '' });
}

function listRosters(page: number): Paginated<RosterDTO> {
    requireUser();
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const sorted = Tables.Rosters.readAll().sort((a, b) =>
        (b.StartDate + b.StartTime).localeCompare(a.StartDate + a.StartTime),
    );
    const dtos = sorted.map((roster) => buildRosterDTO(roster, usersByEmail));
    return paginate(dtos, page, ROSTER_PAGE_SIZE);
}

function createRoster(input: CreateRosterInput, requestId: string): RosterDTO {
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
    if (!input.name || !input.name.trim()) {
        throw new ValidationError('name is required.');
    }

    if (!input.userId) throw new ValidationError('userId is required.');
    const user = Tables.Users.findById(input.userId);
    if (!user) {
        throw new ValidationError('user_not_found: ' + input.userId);
    }

    const { result: roster } = withLockedDedupe('roster:create', requestId, () => {
        return Tables.Rosters.insert({
            StartDate: input.startDate,
            EndDate: input.endDate,
            StartTime: input.startTime || '',
            EndTime: input.endTime || '',
            Name: input.name.trim(),
            UserId: user.Email,
        });
    });

    sendNotificationEmail(
        user.Email,
        'roster:' + roster.Id + ':assigned',
        'New shift scheduled',
        'You have been assigned to a shift on ' + roster.StartDate + '.',
        '?section=roster',
    );

    return Object.assign({}, roster, { userName: user.Name });
}
