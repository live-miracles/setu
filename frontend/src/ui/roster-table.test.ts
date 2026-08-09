import {
    buildRosterTableModel,
    formatRosterTableDate,
    formatRosterTableTimes,
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
}
