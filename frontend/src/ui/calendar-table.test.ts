import { buildCalendarTableModel } from './calendar-table';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const session = (overrides: Partial<ProgramSession>): ProgramSession =>
    ({
        Name: 'Evening show',
        Type: 'Live',
        StartDateTime: '2026-08-11T18:00:00',
        EndDateTime: '2026-08-11T21:00:00',
        ...overrides,
    }) as ProgramSession;

const program = (overrides: Partial<ProgramRequestDTO>): ProgramRequestDTO =>
    ({
        Id: 'program-1',
        DisplayId: 1,
        Name: 'Title',
        Language: 'English',
        Type: 'Webinar',
        UserId: 'user@example.com',
        Status: 'approved',
        PlaceId: 'place-1',
        DepartmentId: '',
        LeadEmail: '',
        Participants: '',
        SessionsJson: '',
        userName: 'User',
        placeName: 'Studio A',
        departmentName: '',
        participants: [],
        sessions: [session({})],
        comments: [],
        ...overrides,
    }) as ProgramRequestDTO;

export function runCalendarTableAssertions(): void {
    const model = buildCalendarTableModel(
        [
            program({
                Id: 'program-1',
                sessions: [
                    session({}),
                    session({
                        Name: 'Late show',
                        StartDateTime: '2026-08-11T22:00:00',
                        EndDateTime: '2026-08-11T23:00:00',
                    }),
                ],
            }),
            program({
                Id: 'program-2',
                Name: 'Other title',
                Type: 'Other',
                sessions: [session({ Name: 'Other session', Type: 'Talk' })],
            }),
            program({
                Id: 'rejected',
                Status: 'rejected',
                sessions: [
                    session({
                        StartDateTime: '2026-08-20T18:00:00',
                        EndDateTime: '2026-08-20T19:00:00',
                    }),
                ],
            }),
            program({
                Id: 'past',
                sessions: [
                    session({
                        StartDateTime: '2026-08-01T18:00:00',
                        EndDateTime: '2026-08-01T19:00:00',
                    }),
                ],
            }),
        ],
        [
            { Id: 'place-1', Name: 'Studio A', AllowOverlap: false },
            { Id: 'place-2', Name: 'Studio B', AllowOverlap: false },
        ],
        [
            { Id: 'type-webinar', Name: 'Webinar', Color: '#7cc9a4' },
            { Id: 'type-other', Name: 'Other', Color: '' },
        ],
        '2026-08-11',
    );

    assert(model.rows[0].isoDate === '2026-08-09', 'window starts two days before today');
    assert(
        model.rows[model.rows.length - 1]?.isoDate === '2026-08-11',
        'window ends at latest upcoming date',
    );
    assert(model.rows.length === 3, 'window includes dates without sessions');
    assert(model.rows[2].label === 'Tue, Aug 11', 'date label includes weekday');

    const studio = model.rows[2].places[0];
    assert(studio.blocks.length === 2, 'different programs stack in the same place');
    assert(studio.blocks[0].sessions.length === 2, 'sessions group into one program block');
    assert(studio.blocks[0].title === 'English Webinar Title', 'program label format');
    assert(
        studio.blocks[0].sessions[0].label === '18:00 - 21:00 Live Evening show',
        'session label format',
    );
    assert(studio.blocks[0].color === '#7cc9a4', 'program type color is resolved');
    assert(
        studio.blocks[1].title === 'English Other title',
        'Other type is omitted from program label',
    );
    assert(studio.blocks[1].color === '', 'Other type has no color');
    assert(
        model.rows[0].places.every((place) => place.blocks.length === 0),
        'empty cells stay empty',
    );
}
