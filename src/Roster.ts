const ROSTER_PAGE_SIZE = 20;

function buildRosterDTO(roster: Roster, usersByEmail: Record<string, User>): RosterDTO {
    const user = usersByEmail[roster.UserId];
    return Object.assign({}, roster, { userName: user ? user.Name : '' });
}

// The whole roster — reading it, not just scheduling into it — is limited
// to admins and approvers (canApprove in Auth.ts). Crew on the `viewer` or
// `user` role can still be assigned shifts, but they have no in-app shift
// list.
function listRosters(page: number): Paginated<RosterDTO> {
    requireApprover();
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const sorted = Tables.Rosters.readAll().sort((a, b) =>
        (b.StartDate + b.StartTime).localeCompare(a.StartDate + a.StartTime),
    );
    const dtos = sorted.map((roster) => buildRosterDTO(roster, usersByEmail));
    return paginate(dtos, page, ROSTER_PAGE_SIZE);
}

// Shared by create/update - endTime <= startTime is not an error, it means
// the shift crosses midnight into the day after (e.g. 22:00-04:00 covers
// 22:00-24:00 that day and 00:00-04:00 the next); the calendar splits it
// into two blocks.
function requireValidRosterInput(input: CreateRosterInput): User {
    if (!input.startDate || !input.endDate) {
        throw new ValidationError('startDate and endDate are required.');
    }
    if (input.endDate < input.startDate) {
        throw new ValidationError('endDate must not be before startDate.');
    }
    if (!input.name || !input.name.trim()) {
        throw new ValidationError('name is required.');
    }
    if (!input.userId) throw new ValidationError('userId is required.');
    const user = Tables.Users.findById(input.userId);
    if (!user) {
        throw new ValidationError('user_not_found: ' + input.userId);
    }
    return user;
}

// Scheduling is an approver power, not an admin one. Anyone in the Users
// tab can be the assignee, including roles that can't open the roster
// themselves.
function createRoster(input: CreateRosterInput, requestId: string): RosterDTO {
    requireApprover();
    const user = requireValidRosterInput(input);

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

    return Object.assign({}, roster, { userName: user.Name });
}

function updateRoster(id: string, input: CreateRosterInput, requestId: string): RosterDTO {
    requireApprover();
    const user = requireValidRosterInput(input);

    const { result: roster } = withLockedDedupe('roster:update', requestId, () => {
        if (!Tables.Rosters.findById(id)) throw new ValidationError('not_found');
        return Tables.Rosters.updateById(id, {
            StartDate: input.startDate,
            EndDate: input.endDate,
            StartTime: input.startTime || '',
            EndTime: input.endTime || '',
            Name: input.name.trim(),
            UserId: user.Email,
        });
    });

    return Object.assign({}, roster, { userName: user.Name });
}

function deleteRoster(id: string, requestId: string): void {
    requireApprover();
    const roster = Tables.Rosters.findById(id);

    withLockedDedupe('roster:delete', requestId, () => {
        Tables.Rosters.deleteById(id);
        return null;
    });

    void roster;
}
