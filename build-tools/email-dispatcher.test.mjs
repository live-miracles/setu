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
    assert.match(
        html,
        /<a href="https:\/\/setu\.example\.test\/programs\/abc"[^>]*>View request<\/a>/,
    );
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<h1[^>]*>Workshop – Hall A<\/h1>/);
    assert.match(html, />PRG-7<\/span>/);
    assert.match(html, /2 ×<\/td>/);
    assert.match(html, />commented<\/span>/);
    // Stored text is escaped everywhere, including the hidden preheader.
    assert.doesNotMatch(html, /<the>/);
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

test('the dispatch secret is compared in full and never matches a missing or empty value', async () => {
    const source = await readFile(
        new URL('../supabase/functions/email-dispatcher/secret.ts', import.meta.url),
        'utf8',
    );
    const { code } = await transform(source, { loader: 'ts', format: 'esm' });
    const { secretsMatch } = await import(
        `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    );
    assert.equal(await secretsMatch('shared-secret', 'shared-secret'), true);
    assert.equal(await secretsMatch('shared-secreT', 'shared-secret'), false);
    assert.equal(await secretsMatch('shared-secret-and-more', 'shared-secret'), false);
    assert.equal(await secretsMatch('shared', 'shared-secret'), false);
    assert.equal(await secretsMatch('', 'shared-secret'), false);
    assert.equal(await secretsMatch(null, 'shared-secret'), false);
    assert.equal(await secretsMatch('', ''), false);
});

test('comment emails for one request share a thread root so Gmail stacks them', async () => {
    const { buildRawEmail, threadingFor } = await loadFormat();
    const payload = { targetId: 'AB12-cd34', message: 'Hi', targetName: 'Request' };
    const first = { id: 'row-1', recipient: 'a@example.test', attempts: 1, payload };
    const second = { id: 'row-2', recipient: 'a@example.test', attempts: 1, payload };

    const rootThreading = threadingFor(first, 'sender@example.test', true);
    assert.deepEqual(rootThreading, { messageId: '<setu-thread-AB12-cd34@example.test>' });
    const replyThreading = threadingFor(second, 'sender@example.test', false);
    assert.deepEqual(replyThreading, {
        messageId: '<setu-row-2@example.test>',
        inReplyTo: '<setu-thread-AB12-cd34@example.test>',
    });

    const rootMime = decodeBase64Url(buildRawEmail(first, settings, 'b', rootThreading));
    assert.match(rootMime, /\r\nMessage-ID: <setu-thread-AB12-cd34@example\.test>\r\n/);
    assert.doesNotMatch(rootMime, /In-Reply-To|References/);

    const replyMime = decodeBase64Url(buildRawEmail(second, settings, 'b', replyThreading));
    assert.match(replyMime, /\r\nMessage-ID: <setu-row-2@example\.test>\r\n/);
    assert.match(replyMime, /\r\nIn-Reply-To: <setu-thread-AB12-cd34@example\.test>\r\n/);
    assert.match(replyMime, /\r\nReferences: <setu-thread-AB12-cd34@example\.test>\r\n/);
});

test('emails without a request id are sent unthreaded', async () => {
    const { buildRawEmail, threadingFor } = await loadFormat();
    const row = { id: 'row-1', recipient: 'a@example.test', attempts: 1, payload: {} };
    assert.equal(threadingFor(row, 'sender@example.test', true), undefined);
    const mime = decodeBase64Url(buildRawEmail(row, settings, 'b', undefined));
    assert.doesNotMatch(mime, /Message-ID|In-Reply-To|References/);
});

test('a status change email names the old and new status instead of a comment', async () => {
    const { buildRawEmail } = await loadFormat();
    const row = {
        id: 'row-1',
        recipient: 'a@example.test',
        attempts: 1,
        payload: {
            kind: 'status',
            statusFrom: 'submitted',
            statusTo: 'approved',
            statusNote: 'Hall A <confirmed>',
            message: 'Approved this request. Hall A <confirmed>',
            authorName: 'Test Approver',
            requestSerial: 'PRG-7',
            requestTitle: 'Workshop',
            targetId: 'abc',
        },
    };
    const mime = decodeBase64Url(buildRawEmail(row, settings, 'b'));
    const text = decodePart(mime, 'text/plain');
    assert.match(
        text,
        /^Test Approver changed the status from Submitted to Approved\.\n\nNote: Hall A <confirmed>/,
    );
    assert.doesNotMatch(text, /commented/);
    const html = decodePart(mime, 'text/html');
    assert.match(html, /<strong[^>]*>Test Approver<\/strong>/);
    assert.match(html, />changed the status<\/span>/);
    assert.match(html, />Submitted<\/span>[\s\S]*>Approved<\/span>/);
    assert.match(html, /Hall A &lt;confirmed&gt;/);
    assert.doesNotMatch(html, /commented/);

    const withoutNote = decodePart(
        decodeBase64Url(
            buildRawEmail(
                { ...row, payload: { ...row.payload, statusNote: null, statusFrom: null } },
                settings,
                'b',
            ),
        ),
        'text/plain',
    );
    assert.match(
        withoutNote,
        /^Test Approver changed the status to Approved\.\n\nView request|^Test Approver changed the status to Approved\.\n\nOpen Setu/,
    );

    const comment = decodePart(
        decodeBase64Url(
            buildRawEmail(
                {
                    ...row,
                    payload: { message: 'Hello', authorName: 'Test Author', kind: 'comment' },
                },
                settings,
                'b',
            ),
        ),
        'text/plain',
    );
    assert.match(comment, /^Test Author commented:\n\nHello/);
});

test('HTML email lays out sessions and falls back without a request link', async () => {
    const { formatEmailHtmlBody, sessionParts } = await loadFormat();
    const session = {
        name: 'Rehearsal',
        startAt: '2026-09-04T03:30:00Z',
        endAt: '2026-09-04T05:00:00Z',
    };
    assert.deepEqual(sessionParts(session, 'Asia/Kolkata'), {
        date: 'Fri, 4 Sep',
        time: '9:00 - 10:30',
        label: 'Rehearsal',
    });
    const html = formatEmailHtmlBody(
        'Hi',
        { authorName: 'Pat', sessions: [session] },
        { appUrl: '', timeZone: 'Asia/Kolkata' },
    );
    assert.match(html, /Sessions \(4 Sep, 2026\)/);
    assert.match(html, /Fri, 4 Sep/);
    assert.match(html, /9:00 - 10:30/);
    assert.match(html, /Time zone \(GMT\+05:30\)/);
    assert.match(html, /Open Setu to view the conversation\./);
    assert.doesNotMatch(html, /View request/);
});
