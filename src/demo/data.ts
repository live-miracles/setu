import { addDays, formatISO, setHours, startOfDay, subDays } from 'date-fns';
import type { DemoState } from '@/domain/types';

const today = startOfDay(new Date());
const at = (dayOffset: number, hour: number) =>
    formatISO(setHours(addDays(today, dayOffset), hour));
const day = (dayOffset: number) => formatISO(addDays(today, dayOffset), { representation: 'date' });
const time = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const admin = { id: 'admin@example.org', name: 'Alex Kim' };
const morgan = { id: 'morgan@example.org', name: 'Morgan Lee' };
const jordan = { id: 'jordan@example.org', name: 'Jordan Patel' };
const taylor = { id: 'taylor@example.org', name: 'Taylor Chen' };

export const demoState: DemoState = {
    currentUser: {
        ...admin,
        role: 'admin',
        department: 'Live Stream',
        timezone: 'Asia/Kolkata',
        phone: '+91 90000 00000',
        whatsapp: '+91 90000 00000',
    },
    users: [
        { ...admin, role: 'admin', department: 'Live Stream', timezone: 'Asia/Kolkata' },
        { ...morgan, role: 'member', department: 'Live Stream', timezone: 'Asia/Kolkata' },
        { ...jordan, role: 'member', department: 'Live Stream', timezone: 'Asia/Kolkata' },
        { ...taylor, role: 'member', department: 'Live Stream', timezone: 'Asia/Kolkata' },
    ],
    rosters: [
        {
            id: 'roster-1',
            name: 'Morning Shift',
            startDate: day(0),
            endDate: day(0),
            startTime: time(6),
            endTime: time(12),
            user: morgan,
        },
        {
            id: 'roster-2',
            name: 'Morning Shift',
            startDate: day(0),
            endDate: day(0),
            startTime: time(6),
            endTime: time(12),
            user: admin,
        },
        {
            id: 'roster-3',
            name: 'Evening Shift',
            startDate: day(0),
            endDate: day(0),
            startTime: time(16),
            endTime: time(22),
            user: jordan,
        },
        {
            id: 'roster-4',
            name: 'Evening Shift',
            startDate: day(0),
            endDate: day(0),
            startTime: time(16),
            endTime: time(22),
            user: taylor,
        },
        {
            id: 'roster-5',
            name: 'Morning Shift',
            startDate: day(1),
            endDate: day(1),
            startTime: time(6),
            endTime: time(12),
            user: morgan,
        },
    ],
    inventoryTypes: [
        {
            id: 'inv-type-1',
            name: 'Sony PXW-Z190 Camera',
            description: 'Broadcast camera with 4K support.',
            requestable: true,
            totalQuantity: 4,
            availableQuantity: 3,
        },
        {
            id: 'inv-type-2',
            name: 'Magewell HDMI Capture',
            description: 'USB capture card for laptop encoding.',
            requestable: true,
            totalQuantity: 8,
            availableQuantity: 7,
        },
        {
            id: 'inv-type-3',
            name: 'Sennheiser Wireless Kit',
            description: 'Lapel mic and receiver pair.',
            requestable: true,
            totalQuantity: 3,
            availableQuantity: 3,
        },
        {
            id: 'inv-type-4',
            name: 'SDI Cable 30m',
            requestable: true,
            totalQuantity: 12,
            availableQuantity: 12,
        },
    ],
    inventoryRequests: [
        {
            id: 'req-1042',
            displayId: 1042,
            name: 'GLP IE 7 Step',
            requester: { ...morgan, department: 'Live Stream' },
            startDate: day(1),
            endDate: day(4),
            status: 'submitted',
            items: [
                {
                    id: 'req-item-1',
                    inventoryTypeId: 'inv-type-1',
                    name: 'Sony PXW-Z190 Camera',
                    quantity: 1,
                    issuedQuantity: 0,
                    returnedQuantity: 0,
                },
                {
                    id: 'req-item-2',
                    inventoryTypeId: 'inv-type-3',
                    name: 'Sennheiser Wireless Kit',
                    quantity: 1,
                    issuedQuantity: 0,
                    returnedQuantity: 0,
                },
            ],
            images: [],
            comments: [],
        },
        {
            id: 'req-1038',
            displayId: 1038,
            name: 'Video publication setup',
            requester: { ...jordan, department: 'Live Stream' },
            startDate: day(-4),
            endDate: day(-1),
            status: 'issued',
            items: [
                {
                    id: 'req-item-3',
                    inventoryTypeId: 'inv-type-2',
                    name: 'Magewell HDMI Capture',
                    quantity: 1,
                    issuedQuantity: 1,
                    returnedQuantity: 0,
                },
            ],
            images: [],
            comments: [
                {
                    id: 'comment-1',
                    timestamp: subDays(new Date(), 3).toISOString(),
                    author: admin,
                    message: 'Approved for the week — please return by the end date.',
                },
            ],
        },
        {
            id: 'req-1032',
            displayId: 1032,
            name: 'Studio cable replacement',
            requester: { ...admin, department: 'Live Stream' },
            startDate: day(-8),
            endDate: day(-6),
            status: 'closed',
            items: [
                {
                    id: 'req-item-4',
                    inventoryTypeId: 'inv-type-4',
                    name: 'SDI Cable 30m',
                    quantity: 2,
                    issuedQuantity: 2,
                    returnedQuantity: 2,
                    condition: 'good',
                },
            ],
            images: [],
            comments: [],
        },
    ],
    programRequests: [
        {
            id: 'prg-1',
            displayId: 1,
            name: 'Sunday Live Program',
            type: 'Live Broadcast',
            requester: { ...jordan, department: 'Live Stream' },
            place: 'Drishti Studio',
            status: 'approved',
            sessions: [
                {
                    id: 'session-1',
                    name: 'Morning Session',
                    type: 'Rehearsal',
                    startDateTime: at(2, 8),
                    endDateTime: at(2, 10),
                },
                {
                    id: 'session-2',
                    name: 'Main Session',
                    type: 'Live',
                    startDateTime: at(2, 10),
                    endDateTime: at(2, 12),
                },
            ],
            comments: [],
        },
        {
            id: 'prg-2',
            displayId: 2,
            name: 'Youth Camp Coverage',
            type: 'Recording',
            requester: { ...morgan, department: 'Live Stream' },
            place: 'Drishti Store',
            status: 'submitted',
            sessions: [
                {
                    id: 'session-3',
                    name: 'Day 1',
                    type: 'Recording',
                    startDateTime: at(5, 9),
                    endDateTime: at(5, 17),
                },
            ],
            comments: [],
        },
    ],
    tickets: [
        {
            id: 'tkt-218',
            displayId: 218,
            title: 'Studio 9 audio drops',
            description: 'Audio stops unexpectedly after several minutes.',
            status: 'pending',
            assignee: morgan,
        },
        {
            id: 'tkt-221',
            displayId: 221,
            title: 'PCR desktop system check',
            description: 'Run the last-system checklist before the next program.',
            status: 'unassigned',
        },
        {
            id: 'tkt-210',
            displayId: 210,
            title: 'Remove unused pipes',
            description: 'Coordinate with the network team.',
            status: 'closed',
            assignee: taylor,
        },
    ],
    links: [
        { id: 'link-1', name: 'Drishti Calendar', url: 'https://calendar.google.com/' },
        { id: 'link-2', name: 'Step 7 Config', url: 'https://docs.google.com/spreadsheets/' },
        { id: 'link-3', name: 'Monitoring Gallery', url: 'https://live-miracles.github.io/gallery' },
        { id: 'link-4', name: 'Delayed YouTube', url: 'https://live-miracles.github.io/delayed-yt' },
    ],
    homeContent: {
        supportMessage:
            'Namaskaram! Please stay a-Live. Keep studios clean, sign the entry book and do not move installed equipment.',
        guidelines:
            'No food in studios. Leave bags outside. Switch on the green light when your session starts. Report equipment changes through a ticket.',
        whatsappUrl: 'https://chat.whatsapp.com/',
        tutorialUrl: 'https://www.youtube.com/',
    },
};
