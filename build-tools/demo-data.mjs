// Fictional data for the demo server (demo.mjs). Everything here is invented:
// people, departments, places and equipment do not describe a real
// organisation, and every address uses the reserved example.org domain.
// Dates are relative to "now" so the home screen and calendar always show
// upcoming work, whatever day the demo runs.

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A date `offset` days from today, at the given local hour. */
function at(offset, hour = 9, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return d;
}

const email = (name) => `${name}@example.org`;

export const departments = [
    { Id: 'dep-studio', Name: 'Studio Operations', ShortName: 'OPS', LeadEmail: email('asha.rao') },
    { Id: 'dep-edu', Name: 'Education', ShortName: 'EDU', LeadEmail: email('lena.fischer') },
    { Id: 'dep-events', Name: 'Events', ShortName: 'EVT', LeadEmail: email('omar.haddad') },
    { Id: 'dep-outreach', Name: 'Outreach', ShortName: 'OUT', LeadEmail: email('mei.tanaka') },
];

const deptName = (id) => departments.find((d) => d.Id === id)?.Name ?? '';

const people = [
    ['asha.rao', 'Asha Rao', 'admin', 'dep-studio'],
    ['diego.alvarez', 'Diego Alvarez', 'approver', 'dep-studio'],
    ['lena.fischer', 'Lena Fischer', 'user', 'dep-edu'],
    ['omar.haddad', 'Omar Haddad', 'user', 'dep-events'],
    ['mei.tanaka', 'Mei Tanaka', 'user', 'dep-outreach'],
    ['priya.nair', 'Priya Nair', 'viewer', 'dep-studio'],
    ['tomas.novak', 'Tomas Novak', 'user', 'dep-events'],
    ['zoe.mitchell', 'Zoe Mitchell', 'user', 'dep-edu'],
];

export const users = people.map(([local, Name, Role, DepartmentId], i) => ({
    Email: email(local),
    Name,
    Role,
    DepartmentId,
    Phone: `+1 555 01${pad(10 + i)}`,
    Whatsapp: `+1 555 01${pad(10 + i)}`,
    departmentName: deptName(DepartmentId),
}));

const userName = (e) => users.find((u) => u.Email === e)?.Name ?? e;

export const me = users[0];

export const places = [
    { Id: 'pl-a', Name: 'Studio A' },
    { Id: 'pl-b', Name: 'Studio B' },
    { Id: 'pl-aud', Name: 'Auditorium' },
    { Id: 'pl-hall', Name: 'Garden Hall' },
];

export const inventoryPlaces = [
    { Id: 'ip-room', Name: 'Equipment room' },
    { Id: 'ip-cage', Name: 'Lens cage' },
    { Id: 'ip-store', Name: 'Cable store' },
];

export const inventoryBrands = ['Northwind', 'Lumen', 'Harbor Audio', 'Atlas', 'Pico'].map(
    (Name, i) => ({ Id: `br-${i}`, Name }),
);

const typeSeed = [
    ['Northwind', 'Cinema camera', 'NC-6', 'ip-room', 'Full-frame cinema camera body.', 3],
    ['Northwind', 'Prime lens kit', 'PL-35/50/85', 'ip-cage', 'Three fast prime lenses.', 4],
    ['Lumen', 'LED panel light', 'LP-600', 'ip-room', 'Bi-colour panel with stand.', 8],
    ['Lumen', 'Softbox', 'SB-120', 'ip-room', 'Collapsible 120 cm softbox.', 5],
    ['Harbor Audio', 'Wireless lapel mic', 'WL-2', 'ip-room', 'Dual-channel wireless kit.', 6],
    [
        'Harbor Audio',
        'Shotgun microphone',
        'SG-416',
        'ip-cage',
        'With boom pole and windscreen.',
        2,
    ],
    ['Atlas', 'Tripod', 'TR-75', 'ip-room', 'Fluid-head video tripod.', 6],
    ['Atlas', 'Slider', 'SL-100', 'ip-room', 'One metre camera slider.', 2],
    ['Pico', 'SDI cable 15 m', 'SC-15', 'ip-store', 'Shielded cable, BNC ends.', 20],
    ['Pico', 'Teleprompter', 'TP-17', 'ip-room', '17 inch with hood.', 2],
];

export const inventoryTypes = typeSeed.map(
    ([Brand, Name, Model, LocationId, Description, TotalQuantity], i) => {
        const Id = `it-${i + 1}`;
        const Location = inventoryPlaces.find((p) => p.Id === LocationId)?.Name ?? '';
        const labelCount = TotalQuantity <= 8 ? TotalQuantity : 0;
        const labels = Array.from({ length: labelCount }, (_, n) => ({
            Id: `${Id}-l${n + 1}`,
            DisplayId: (i + 1) * 100 + n + 1,
            InventoryTypeId: Id,
            Name: `${Name} ${n + 1}`,
            Location: '',
            LocationId: '',
        }));
        return {
            Id,
            DisplayId: i + 1,
            Brand,
            Name,
            Model,
            Location,
            LocationId,
            Description,
            Requestable: true,
            ImageId: '',
            TotalQuantity,
            availableQuantity: Math.max(0, TotalQuantity - (i % 3)),
            labels,
        };
    },
);

export const shiftTypes = [
    {
        Id: 'sh-morning',
        Name: 'Morning',
        Color: '#f97316',
        DefaultStartTime: '07:00',
        DefaultEndTime: '15:00',
    },
    {
        Id: 'sh-evening',
        Name: 'Evening',
        Color: '#3b82f6',
        DefaultStartTime: '15:00',
        DefaultEndTime: '23:00',
    },
    {
        Id: 'sh-live',
        Name: 'Live broadcast',
        Color: '#22c55e',
        DefaultStartTime: '',
        DefaultEndTime: '',
    },
];

export const programTypes = [
    { Name: 'Workshop', Color: '#f97316' },
    { Name: 'Live session', Color: '#3b82f6' },
    { Name: 'Interview', Color: '#a855f7' },
    { Name: 'Recording', Color: '#22c55e' },
];
export const programLanguages = [{ Name: 'English' }, { Name: 'Spanish' }, { Name: 'Hindi' }];
export const sessionTypes = [{ Name: 'Rehearsal' }, { Name: 'Main session' }, { Name: 'Q&A' }];

export const blocks = [
    {
        Id: 'bl-1',
        Name: 'Studio maintenance',
        StartDateTime: at(5, 8).toISOString(),
        EndDateTime: at(5, 18).toISOString(),
        Place: 'Studio B',
    },
];

export const homeContent = {
    Guidelines: [
        '## Welcome to Setu',
        '',
        'This is demo data: every person, place and item here is made up.',
        '',
        '- Request equipment **at least two days ahead**.',
        '- Programs need an approved place before they appear on the calendar.',
        '- Return equipment on the end date and report damage in the request comments.',
    ].join('\n'),
    HiddenViews: [],
    ViewOrder: [
        'programs',
        'calendar',
        'roster',
        'blocks',
        'inventory',
        'inventory-types',
        'inventory-labels',
    ],
};

export const rosters = [
    ['diego.alvarez', 'sh-morning', 'Morning', 0, 0, '07:00', '15:00'],
    ['priya.nair', 'sh-evening', 'Evening', 0, 0, '15:00', '23:00'],
    ['tomas.novak', 'sh-live', 'Live broadcast', 1, 1, '18:00', '21:00'],
    ['diego.alvarez', 'sh-morning', 'Morning', 1, 3, '07:00', '15:00'],
    ['zoe.mitchell', 'sh-evening', 'Evening', 2, 4, '15:00', '23:00'],
    ['mei.tanaka', 'sh-live', 'Live broadcast', 4, 4, '10:00', '13:00'],
].map(([who, ShiftTypeId, ShiftName, from, to, StartTime, EndTime], i) => ({
    Id: `ro-${i + 1}`,
    ShiftTypeId,
    ShiftName,
    Name: '',
    StartDate: isoDate(at(from)),
    EndDate: isoDate(at(to)),
    StartTime,
    EndTime,
    UserId: email(who),
    userName: userName(email(who)),
}));

// An entry is [who, daysAgo, message] for a comment, or with a fourth item
// {Kind, Data} for a status or edit event (Message is then its summary).
function comments(requestId, entries) {
    return entries.map(([who, daysAgo, Message, event], i) => ({
        Id: `${requestId}-c${i + 1}`,
        Timestamp: at(-daysAgo, 10 + i).toISOString(),
        RequestId: requestId,
        UserId: email(who),
        Message,
        Kind: event?.Kind ?? 'comment',
        Data: event?.Data ?? null,
        userName: userName(email(who)),
    }));
}

function inventoryRequest(n, Name, who, dept, status, from, to, items, extra = []) {
    const Id = `ir-${n}`;
    return {
        Id,
        DisplayId: n,
        Name,
        UserId: email(who),
        StartDate: isoDate(at(from)),
        EndDate: isoDate(at(to)),
        Status: status,
        ImageId: '',
        DepartmentId: dept,
        LeadEmail: departments.find((d) => d.Id === dept)?.LeadEmail ?? '',
        userName: userName(email(who)),
        departmentName: deptName(dept),
        participants: [],
        items: items.map(([typeIndex, Quantity]) => {
            const type = inventoryTypes[typeIndex];
            return {
                InventoryTypeId: type.Id,
                Quantity,
                Condition: status === 'closed' ? 'returned' : '',
                itemName: `${type.Brand} ${type.Name}`,
                labels: type.labels.slice(0, Math.min(Quantity, type.labels.length)),
            };
        }),
        comments: comments(Id, [[who, 6, 'Submitting this for the upcoming shoot.'], ...extra]),
    };
}

export const inventoryRequests = [
    inventoryRequest(1, 'Spring interview shoot', 'lena.fischer', 'dep-edu', 'submitted', 2, 4, [
        [0, 1],
        [1, 1],
        [6, 1],
    ]),
    inventoryRequest(
        2,
        'Garden Hall livestream',
        'omar.haddad',
        'dep-events',
        'approved',
        3,
        5,
        [
            [0, 2],
            [4, 3],
            [8, 4],
        ],
        [
            [
                'omar.haddad',
                5,
                'Edited End date, Items',
                {
                    Kind: 'edit',
                    Data: {
                        changes: [
                            { field: 'End date', from: '4 Jun 2031', to: '5 Jun 2031' },
                            {
                                field: 'Items',
                                added: [{ label: 'Tripod × 1' }],
                                removed: [{ label: 'Lav mic × 2' }],
                            },
                        ],
                    },
                },
            ],
            [
                'diego.alvarez',
                4,
                'Approved this request. Collect from the equipment room on the 3rd.',
                {
                    Kind: 'status',
                    Data: {
                        from: 'submitted',
                        to: 'approved',
                        action: 'approve',
                        note: 'Collect from the equipment room on the 3rd.',
                    },
                },
            ],
        ],
    ),
    inventoryRequest(
        3,
        'Workshop audio kit',
        'mei.tanaka',
        'dep-outreach',
        'issued',
        -2,
        1,
        [
            [4, 2],
            [5, 1],
        ],
        [['diego.alvarez', 3, 'Issued, with two spare batteries.']],
    ),
    inventoryRequest(4, 'Product demo lighting', 'tomas.novak', 'dep-events', 'submitted', 6, 7, [
        [2, 4],
        [3, 2],
    ]),
    inventoryRequest(5, 'Teleprompter for town hall', 'zoe.mitchell', 'dep-edu', 'draft', 9, 10, [
        [9, 1],
    ]),
    inventoryRequest(
        6,
        'Documentary B-roll',
        'lena.fischer',
        'dep-edu',
        'closed',
        -14,
        -9,
        [
            [0, 1],
            [7, 1],
        ],
        [['diego.alvarez', 8, 'Returned in good condition. Closing.']],
    ),
    inventoryRequest(
        7,
        'Outdoor camp recording',
        'mei.tanaka',
        'dep-outreach',
        'rejected',
        -7,
        -5,
        [[0, 3]],
        [
            [
                'diego.alvarez',
                9,
                'Rejected: only two camera bodies are free that week. Please reduce the quantity.',
            ],
        ],
    ),
];

function programRequest(n, Name, who, dept, status, type, language, placeId, sessions, extra = []) {
    const Id = `pr-${n}`;
    const list = sessions.map(([name, sessionType, day, startHour, endHour]) => ({
        Name: name,
        Type: sessionType,
        StartDateTime: at(day, startHour).toISOString(),
        EndDateTime: at(day, endHour).toISOString(),
    }));
    return {
        Id,
        DisplayId: n,
        Name,
        Language: language,
        Type: type,
        UserId: email(who),
        Status: status,
        PlaceId: placeId,
        DepartmentId: dept,
        LeadEmail: departments.find((d) => d.Id === dept)?.LeadEmail ?? '',
        userName: userName(email(who)),
        placeName: places.find((p) => p.Id === placeId)?.Name ?? '',
        departmentName: deptName(dept),
        participants: [],
        sessions: list,
        sessionStart: list[0]?.StartDateTime ?? '',
        sessionEnd: list[list.length - 1]?.EndDateTime ?? '',
        comments: comments(Id, [[who, 5, 'Requesting the studio for this program.'], ...extra]),
    };
}

export const programRequests = [
    programRequest(
        1,
        'Mindful Mornings workshop',
        'lena.fischer',
        'dep-edu',
        'approved',
        'Workshop',
        'English',
        'pl-a',
        [
            ['Rehearsal', 'Rehearsal', 1, 9, 11],
            ['Main session', 'Main session', 2, 10, 13],
        ],
        [['diego.alvarez', 3, 'Approved for Studio A.']],
    ),
    programRequest(
        2,
        'Community Q&A live',
        'omar.haddad',
        'dep-events',
        'approved',
        'Live session',
        'English',
        'pl-aud',
        [['Main session', 'Main session', 3, 18, 20]],
    ),
    programRequest(
        3,
        'Spanish storytelling hour',
        'zoe.mitchell',
        'dep-edu',
        'submitted',
        'Recording',
        'Spanish',
        'pl-b',
        [['Main session', 'Main session', 4, 14, 16]],
    ),
    programRequest(
        4,
        'Volunteer orientation',
        'mei.tanaka',
        'dep-outreach',
        'approved',
        'Workshop',
        'Hindi',
        'pl-hall',
        [
            ['Main session', 'Main session', 5, 10, 12],
            ['Q&A', 'Q&A', 5, 12, 13],
        ],
    ),
    programRequest(
        5,
        'Guest interview series',
        'tomas.novak',
        'dep-events',
        'submitted',
        'Interview',
        'English',
        'pl-a',
        [['Main session', 'Main session', 7, 15, 17]],
    ),
    programRequest(
        6,
        'Open day broadcast',
        'omar.haddad',
        'dep-events',
        'draft',
        'Live session',
        'English',
        'pl-aud',
        [['Main session', 'Main session', 12, 9, 12]],
    ),
    programRequest(
        7,
        'Winter recital recording',
        'lena.fischer',
        'dep-edu',
        'approved',
        'Recording',
        'English',
        'pl-b',
        [['Main session', 'Main session', 9, 17, 19]],
    ),
    programRequest(
        8,
        'Facilitator training',
        'mei.tanaka',
        'dep-outreach',
        'rejected',
        'Workshop',
        'English',
        'pl-a',
        [['Main session', 'Main session', 1, 9, 12]],
        [['diego.alvarez', 2, 'Rejected: Studio A is already booked at that time.']],
    ),
    programRequest(
        9,
        'Autumn showcase',
        'zoe.mitchell',
        'dep-edu',
        'cancelled',
        'Live session',
        'English',
        'pl-aud',
        [['Main session', 'Main session', -3, 18, 20]],
    ),
];

export const allowedEmailDomains = [{ domain: 'example.org', enabled: true }];
