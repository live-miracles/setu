import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

async function loadFormat() {
    const source = await readFile(
        new URL('../supabase/functions/email-dispatcher/format.ts', import.meta.url),
        'utf8',
    );
    const { code } = await transform(source, { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const settings = {
    appUrl: 'https://setu.example.test/',
    timeZone: 'Asia/Kolkata',
    senderEmail: 'sender@example.test',
    senderName: 'Live Stream Setu',
    replyTo: '',
    ccEmails: ['ops@example.test', 'Lead@example.test'],
};

function decodeBase64Url(value) {
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function decodePart(mime, type) {
    const match = mime.match(
        new RegExp(
            `Content-Type: ${type}; charset=UTF-8\\r\\n[^\\r]*\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+)`,
        ),
    );
    assert.ok(match, `missing ${type} part`);
    return Buffer.from(match[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
}

test('a failed email send is retried with a growing delay, then marked failed', async () => {
    const { failureUpdate, MAX_DELIVERY_ATTEMPTS } = await loadFormat();
    const before = Date.now();
    const first = failureUpdate(1, new Error('Gmail send failed with HTTP 429'));
    assert.equal(first.status, 'pending');
    assert.match(first.last_error, /HTTP 429/);
    const firstDelay = Date.parse(first.next_attempt_at) - before;
    assert.ok(firstDelay >= 9.9 * 60 * 1000 && firstDelay <= 10.5 * 60 * 1000);

    const third = failureUpdate(3, 'boom');
    assert.ok(Date.parse(third.next_attempt_at) - before >= 29.9 * 60 * 1000);

    assert.deepEqual(failureUpdate(MAX_DELIVERY_ATTEMPTS, 'boom'), {
        status: 'failed',
        last_error: 'boom',
    });
});

test('cc list drops blanks, duplicates and the primary recipient', async () => {
    const { mergeCcEmails, parseEmailList } = await loadFormat();
    assert.deepEqual(parseEmailList(' a@example.test, ,b@example.test '), [
        'a@example.test',
        'b@example.test',
    ]);
    assert.deepEqual(
        mergeCcEmails(
            'lead@example.test',
            ['ops@example.test', 'LEAD@example.test', ''],
            ['OPS@example.test', 'x@example.test'],
        ),
        ['ops@example.test', 'x@example.test'],
    );
});

test('sessions are listed in the configured time zone', async () => {
    const { formatSessionsHeading, formatSessionLine, formatTimeZoneLabel } = await loadFormat();
    const sessions = [
        { name: 'Rehearsal', startAt: '2026-09-04T03:30:00Z', endAt: '2026-09-04T05:00:00Z' },
        { type: 'Live', startAt: '2026-09-06T12:30:00Z', endAt: '2026-09-06T14:15:00Z' },
    ];
    assert.equal(formatSessionsHeading(sessions, 'Asia/Kolkata'), 'Sessions (4 Sep - 6 Sep, 2026)');
    assert.equal(formatSessionsHeading([sessions[0]], 'Asia/Kolkata'), 'Sessions (4 Sep, 2026)');
    assert.equal(
        formatSessionLine(sessions[0], 'Asia/Kolkata'),
        '(Fri, 4 Sep) 9:00 - 10:30 | Rehearsal',
    );
    assert.equal(
        formatSessionLine(sessions[1], 'Asia/Kolkata'),
        '(Sun, 6 Sep) 18:00 - 19:45 | Live',
    );
    assert.equal(
        formatTimeZoneLabel('Asia/Kolkata', sessions),
        'Time zone (GMT+05:30) India Standard Time – Kolkata',
    );
    assert.equal(
        formatTimeZoneLabel('UTC', sessions),
        'Time zone (GMT+00:00) Coordinated Universal Time – UTC',
    );
});

test('raw Gmail message carries headers, both bodies and the request link', async () => {
    const { buildRawEmail } = await loadFormat();
    const raw = buildRawEmail(
        {
            id: 'row-1',
            recipient: 'lead@example.test',
            attempts: 1,
            payload: {
                cc: ['member@example.test'],
                message: 'Please confirm <the> cameras\nThanks',
                requestSerial: 'PRG-7',
                requestTitle: 'Workshop – Hall A',
                requestMonthYear: 'Sep 2026',
                authorName: 'Test Author',
                requestPath: '/programs/abc',
                items: [{ name: 'Tripod', quantity: 2 }],
            },
        },
        { ...settings, replyTo: 'team@example.test' },
        'test-boundary',
    );
    assert.doesNotMatch(raw, /[+/=]/, 'raw must be base64url without padding');

    const mime = decodeBase64Url(raw);
    assert.match(mime, /^From: Live Stream Setu <sender@example\.test>\r\n/);
    assert.match(mime, /\r\nTo: lead@example\.test\r\n/);
    assert.match(mime, /\r\nCc: member@example\.test, ops@example\.test\r\n/);
    assert.match(mime, /\r\nReply-To: team@example\.test\r\n/);
    assert.match(mime, /Content-Type: multipart\/alternative; boundary="test-boundary"/);
    assert.match(mime, /\r\n--test-boundary--\r\n$/);

    const subject = mime.match(/\r\nSubject: ((?:.|\r\n )+)\r\n/)[1];
    const decodedSubject = subject
        .split('\r\n ')
        .map((word) => Buffer.from(word.match(/^=\?UTF-8\?B\?(.*)\?=$/)[1], 'base64').toString())
        .join('');
    assert.equal(decodedSubject, 'PRG-7 - Workshop – Hall A | Sep 2026');
    for (const word of subject.split('\r\n ')) assert.ok(word.length <= 75);

    const text = decodePart(mime, 'text/plain');
    assert.match(text, /^Test Author commented:\n\nPlease confirm <the> cameras\nThanks/);
    assert.match(text, /- 2 × Tripod/);
    assert.match(text, /View request: https:\/\/setu\.example\.test\/programs\/abc$/);

    const html = decodePart(mime, 'text/html');
    assert.match(html, /Please confirm &lt;the&gt; cameras<br>Thanks/);
    assert.match(html, /<a href="https:\/\/setu\.example\.test\/programs\/abc">View request<\/a>/);
});

test('stored values cannot inject extra email headers', async () => {
    const { buildRawEmail } = await loadFormat();
    const mime = decodeBase64Url(
        buildRawEmail(
            {
                id: 'row-2',
                recipient: 'lead@example.test\r\nBcc: attacker@example.test',
                attempts: 1,
                payload: { requestTitle: 'Title\r\nBcc: attacker@example.test' },
            },
            { ...settings, ccEmails: [] },
            'b',
        ),
    );
    const headers = mime.split('\r\n\r\n')[0].split('\r\n');
    assert.ok(headers.every((line) => !line.startsWith('Bcc:')));
    assert.match(mime, /\r\nSubject: Request - Title Bcc: attacker@example\.test\r\n/);
});
