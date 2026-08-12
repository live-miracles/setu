import {
    buildRosterTableModel,
    formatRosterTableDate,
    formatRosterTableTimes,
    getShiftTypeTimes,
} from './roster-table';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const roster = (overrides: Partial<RosterDTO>): RosterDTO =>
    ({
        Id: 'roster-test',
        Name: 'Morning',
        StartDate: '2026-08-02',
        EndDate: '2026-08-02',
        StartTime: '04:00',
        EndTime: '13:30',
        UserId: 'ana@example.com',
        userName: 'Ana',
        ...overrides,
    }) as RosterDTO;

export function runRosterTableAssertions(): void {
    const model = buildRosterTableModel(
        [
            roster({ Id: 'multi-day', EndDate: '2026-08-04' }),
            roster({
                Id: 'overlap',
                Name: 'Night',
                StartDate: '2026-08-03',
                EndDate: '2026-08-03',
            }),
            roster({ Id: 'later', Name: 'Later', StartDate: '2026-08-05', EndDate: '2026-08-05' }),
        ],
        [],
        '2026-08-02',
    );

    assert(model.rows.length === 4, 'date rows should include every date through the last shift');
    assert(model.rows[0].label === 'Sun, Aug 2', 'date label should include weekday');
    assert(model.volunteers[0].lanes.length === 2, 'overlap should create a second lane');
    assert(
        model.volunteers[0].lanes[0].shifts[0].startIndex === 0,
        'first shift starts at row zero',
    );
    assert(model.volunteers[0].lanes[0].shifts[0].endIndex === 2, 'multi-day shift spans rows');
    assert(formatRosterTableDate('2026-08-02') === 'Sun, Aug 2', 'date formatter');
    assert(
        formatRosterTableTimes(roster({ StartTime: '04:00', EndTime: '' })) === '4:00 AM',
        'partial timing',
    );
    assert(
        formatRosterTableTimes(roster({ StartTime: '', EndTime: '' })) === '',
        'blank timing should be omitted',
    );
    const shiftTypeTimes = getShiftTypeTimes(
        [
            {
                Id: 'morning',
                Name: 'Morning',
                Color: '',
                DefaultStartTime: '04:00',
                DefaultEndTime: '13:30',
            },
        ],
        'morning',
    );
    assert(
        shiftTypeTimes?.startTime === '04:00' && shiftTypeTimes.endTime === '13:30',
        'shift type selection should provide default times',
    );

    const coloredModel = buildRosterTableModel(
        [
            roster({ Id: 'colored', Name: 'Morning Shift' }),
            roster({
                Id: 'uncolored',
                Name: 'Unconfigured Shift',
                StartDate: '2026-08-03',
                EndDate: '2026-08-03',
            }),
        ],
        [
            {
                Id: 'morning-shift',
                Name: 'morning shift',
                Color: '#7cc9a4',
                DefaultStartTime: '',
                DefaultEndTime: '',
            },
        ],
        '2026-08-02',
    );
    const shifts = coloredModel.volunteers.flatMap((volunteer) =>
        volunteer.lanes.flatMap((lane) => lane.shifts),
    );
    assert(
        shifts.find((shift) => shift.roster.Id === 'colored')?.color === '#7cc9a4',
        'roster color should resolve case-insensitively',
    );
    assert(
        shifts.find((shift) => shift.roster.Id === 'uncolored')?.color === '',
        'unconfigured roster color should be empty',
    );
}
