// Pure formatting helpers for comment emails. Kept free of Deno and network
// APIs so build-tools/email-dispatcher.test.mjs can load this file directly.

export type EmailSession = { name?: string; type?: string; startAt?: string; endAt?: string };

export type EmailPayload = {
    targetId?: string;
    cc?: string[];
    message?: string;
    targetName?: string;
    requestSerial?: string;
    requestTitle?: string;
    requestMonthYear?: string;
    authorName?: string;
    // 'status' for a workflow action (statusFrom, statusTo and statusNote say
    // what changed); anything else is a plain comment.
    kind?: string;
    statusFrom?: string | null;
    statusTo?: string | null;
    statusNote?: string | null;
    requestPath?: string;
    automatedReminder?: boolean;
    sessions?: EmailSession[];
    items?: Array<{ name?: string; quantity?: number }>;
};

export type EmailOutboxRow = {
    id: string;
    recipient: string;
    payload: EmailPayload | null;
    attempts: number;
};

export type EmailSettings = {
    appUrl: string;
    timeZone: string;
    senderEmail: string;
    senderName: string;
    replyTo: string;
    ccEmails: string[];
};

export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * A failed send is retried with a growing delay (a transient quota or network
 * error must not lose a notification); only after MAX_DELIVERY_ATTEMPTS does
 * the row stay failed. `attempts` already counts the attempt that just failed.
 */
export function failureUpdate(attempts: number, error: unknown): Record<string, string> {
    const lastError = error instanceof Error ? error.message : String(error);
    if (attempts >= MAX_DELIVERY_ATTEMPTS) return { status: 'failed', last_error: lastError };
    const delayMs = Math.max(1, attempts) * 10 * 60 * 1000;
    return {
        status: 'pending',
        last_error: lastError,
        next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
    };
}

export type EmailThreading = { messageId: string; inReplyTo?: string };

/**
 * Gmail groups messages into a conversation by matching subject plus the
 * Message-ID / In-Reply-To / References headers. Every comment email for a
 * request therefore shares one root id: the first email of a request uses it
 * as its own Message-ID, and later emails reference it. Returns undefined when
 * the row has no request to thread on.
 */
export function threadingFor(
    row: EmailOutboxRow,
    senderEmail: string,
    isFirstInThread: boolean,
): EmailThreading | undefined {
    const targetId = (row.payload?.targetId || '').replace(/[^A-Za-z0-9-]/g, '');
    const domain = senderEmail.split('@')[1]?.replace(/[^A-Za-z0-9.-]/g, '');
    if (!targetId || !domain) return undefined;
    const rootId = `<setu-thread-${targetId}@${domain}>`;
    if (isFirstInThread) return { messageId: rootId };
    const rowId = row.id.replace(/[^A-Za-z0-9-]/g, '');
    return { messageId: `<setu-${rowId}@${domain}>`, inReplyTo: rootId };
}

/** Builds the base64url-encoded RFC 2822 message the Gmail API expects in `raw`. */
export function buildRawEmail(
    row: EmailOutboxRow,
    settings: EmailSettings,
    boundary = `setu-${crypto.randomUUID()}`,
    threading?: EmailThreading,
): string {
    const payload = row.payload || {};
    const message = payload.message || '';
    return toBase64Url(
        buildMimeMessage({
            from: { name: settings.senderName, email: settings.senderEmail },
            to: row.recipient,
            cc: mergeCcEmails(row.recipient, payload.cc || [], settings.ccEmails),
            replyTo: settings.replyTo,
            subject: formatEmailSubject(payload),
            text: formatEmailBody(message, payload, settings),
            html: formatEmailHtmlBody(message, payload, settings),
            boundary,
            threading,
        }),
    );
}

export function formatEmailSubject(payload: EmailPayload): string {
    const serial = payload.requestSerial || 'Request';
    const title = payload.requestTitle || payload.targetName || 'Setu request';
    const monthYear = payload.requestMonthYear || '';
    return `${serial} - ${title}${monthYear ? ` | ${monthYear}` : ''}`;
}

/**
 * What a workflow action email says in place of a comment: "changed the status
 * from Submitted to Approved", plus the approver's optional note. Undefined for
 * plain comments.
 */
export function statusChange(
    payload: EmailPayload,
): { headline: string; note: string } | undefined {
    if (payload.kind !== 'status' || !payload.statusTo) return undefined;
    const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
    const from = payload.statusFrom ? ` from ${label(payload.statusFrom)}` : '';
    return {
        headline: `changed the status${from} to ${label(payload.statusTo)}`,
        note: (payload.statusNote || '').trim(),
    };
}

export function formatEmailBody(
    message: string,
    payload: EmailPayload,
    settings: Pick<EmailSettings, 'appUrl' | 'timeZone'>,
): string {
    const author = payload.authorName || 'Setu Bot';
    const status = statusChange(payload);
    const sections: string[] = [
        status
            ? `${author} ${status.headline}.` + (status.note ? `\n\nNote: ${status.note}` : '')
            : `${author} commented:\n\n${message}`,
    ];
    if (payload.sessions?.length) {
        const { timeZone } = settings;
        sections.push(
            formatSessionsHeading(payload.sessions, timeZone) +
                '\n' +
                payload.sessions.map((session) => formatSessionLine(session, timeZone)).join('\n') +
                `\n\n${formatTimeZoneLabel(timeZone, payload.sessions)}`,
        );
    }
    if (payload.items?.length) {
        sections.push(
            'Inventory items:\n' +
                payload.items
                    .map((item) => `- ${item.quantity || 0} × ${item.name || 'Unnamed item'}`)
                    .join('\n'),
        );
    }
    const requestUrl = requestUrlFor(payload, settings.appUrl);
    sections.push(
        requestUrl ? `View request: ${requestUrl}` : 'Open Setu to view the conversation.',
    );
    return sections.join('\n\n');
}

export function formatEmailHtmlBody(
    message: string,
    payload: EmailPayload,
    settings: Pick<EmailSettings, 'appUrl' | 'timeZone'>,
): string {
    const author = escapeHtml(payload.authorName || 'Setu Bot');
    const status = statusChange(payload);
    const sections: string[] = [
        status
            ? `<p><strong>${author} ${escapeHtml(status.headline)}.</strong></p>` +
              (status.note ? `<p>Note: ${escapeHtml(status.note).replace(/\n/g, '<br>')}</p>` : '')
            : `<p><strong>${author} commented:</strong></p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
    ];
    if (payload.sessions?.length) {
        const { timeZone } = settings;
        sections.push(
            `<p><strong>${escapeHtml(formatSessionsHeading(payload.sessions, timeZone))}</strong></p><ul>` +
                payload.sessions
                    .map(
                        (session) => `<li>${escapeHtml(formatSessionLine(session, timeZone))}</li>`,
                    )
                    .join('') +
                `</ul><p>${escapeHtml(formatTimeZoneLabel(timeZone, payload.sessions))}</p>`,
        );
    }
    if (payload.items?.length) {
        sections.push(
            '<p><strong>Inventory items:</strong></p><ul>' +
                payload.items
                    .map(
                        (item) =>
                            `<li>${item.quantity || 0} × ${escapeHtml(item.name || 'Unnamed item')}</li>`,
                    )
                    .join('') +
                '</ul>',
        );
    }
    const requestUrl = requestUrlFor(payload, settings.appUrl);
    sections.push(
        requestUrl
            ? `<p><a href="${escapeHtml(requestUrl)}">View request</a></p>`
            : '<p>Open Setu to view the conversation.</p>',
    );
    return sections.join('\n');
}

export function formatSessionsHeading(sessions: EmailSession[], timeZone: string): string {
    const dates = sessions
        .flatMap((session) => [parseSessionDate(session.startAt), parseSessionDate(session.endAt)])
        .filter((date): date is Date => Boolean(date))
        .sort((left, right) => left.getTime() - right.getTime());
    if (!dates.length) return 'Sessions';

    const first = dateParts(dates[0], timeZone);
    const last = dateParts(dates[dates.length - 1], timeZone);
    const firstDate = `${first.day} ${first.month}`;
    const lastDate = `${last.day} ${last.month}`;

    if (firstDate === lastDate && first.year === last.year) {
        return `Sessions (${firstDate}, ${first.year})`;
    }
    if (first.year === last.year) {
        return `Sessions (${firstDate} - ${lastDate}, ${last.year})`;
    }
    return `Sessions (${firstDate}, ${first.year} - ${lastDate}, ${last.year})`;
}

export function formatSessionLine(session: EmailSession, timeZone: string): string {
    const start = parseSessionDate(session.startAt);
    const end = parseSessionDate(session.endAt);
    const date = start || end;
    let dateText = '';
    if (date) {
        const parts = dateParts(date, timeZone);
        dateText = `(${parts.weekday}, ${parts.day} ${parts.month}) `;
    }
    const startText = start ? formatTime(start, timeZone) : session.startAt || '';
    const endText = end ? formatTime(end, timeZone) : session.endAt || '';
    const label = session.name || session.type || 'Session';
    return `${dateText}${startText} - ${endText} | ${label}`;
}

export function formatTimeZoneLabel(timeZone: string, sessions: EmailSession[]): string {
    const referenceDate =
        sessions
            .map((session) => parseSessionDate(session.startAt))
            .find((date): date is Date => Boolean(date)) || new Date();
    const offsetName = zonePart(referenceDate, timeZone, 'longOffset');
    // Intl writes UTC itself as plain "GMT"; keep the explicit +00:00 form.
    const offset = offsetName === 'GMT' ? 'GMT+00:00' : offsetName;
    const name = zonePart(referenceDate, timeZone, 'long');
    const city = timeZone.split('/').pop()?.replace(/_/g, ' ') || timeZone;
    const displayName = name.startsWith('GMT') ? timeZone : name;
    return `Time zone (${offset}) ${displayName} – ${city}`;
}

export function mergeCcEmails(
    recipient: string,
    payloadCc: string[],
    configuredCcEmails: string[],
): string[] {
    const recipientKey = recipient.trim().toLowerCase();
    const seen = new Set<string>();
    return [...payloadCc, ...configuredCcEmails]
        .map((email) => email.trim())
        .filter((email) => {
            const key = email.toLowerCase();
            if (!email || key === recipientKey || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

export function parseEmailList(value: string): string[] {
    return value
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean);
}

function parseSessionDate(value: string | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function dateParts(date: Date, timeZone: string) {
    const parts: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).formatToParts(date)) {
        parts[part.type] = part.value;
    }
    return { weekday: parts.weekday, day: parts.day, month: parts.month, year: parts.year };
}

function formatTime(date: Date, timeZone: string): string {
    const parts: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date)) {
        parts[part.type] = part.value;
    }
    return `${Number(parts.hour)}:${parts.minute}`;
}

function zonePart(date: Date, timeZone: string, style: 'long' | 'longOffset'): string {
    return (
        new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: style })
            .formatToParts(date)
            .find((part) => part.type === 'timeZoneName')?.value || timeZone
    );
}

function requestUrlFor(payload: EmailPayload, appUrl: string): string {
    const origin = appUrl.trim().replace(/\/$/, '');
    return payload.requestPath && origin ? `${origin}${payload.requestPath}` : '';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

type MimeMessage = {
    from: { name: string; email: string };
    to: string;
    cc: string[];
    replyTo: string;
    subject: string;
    text: string;
    html: string;
    boundary: string;
    threading?: EmailThreading;
};

export function buildMimeMessage(message: MimeMessage): string {
    const { threading } = message;
    const headers = [
        `From: ${message.from.name ? `${encodeHeaderText(message.from.name)} ` : ''}<${headerValue(message.from.email)}>`,
        `To: ${headerValue(message.to)}`,
        ...(message.cc.length ? [`Cc: ${message.cc.map(headerValue).join(', ')}`] : []),
        ...(message.replyTo ? [`Reply-To: ${headerValue(message.replyTo)}`] : []),
        `Subject: ${encodeHeaderText(message.subject)}`,
        ...(threading ? [`Message-ID: ${headerValue(threading.messageId)}`] : []),
        ...(threading?.inReplyTo
            ? [
                  `In-Reply-To: ${headerValue(threading.inReplyTo)}`,
                  `References: ${headerValue(threading.inReplyTo)}`,
              ]
            : []),
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${message.boundary}"`,
    ];
    const part = (type: string, body: string) =>
        [
            `--${message.boundary}`,
            `Content-Type: ${type}; charset=UTF-8`,
            'Content-Transfer-Encoding: base64',
            '',
            wrapBase64(toBase64(body)),
        ].join('\r\n');
    return [
        ...headers,
        '',
        part('text/plain', message.text),
        part('text/html', message.html),
        `--${message.boundary}--`,
        '',
    ].join('\r\n');
}

/** Removes line breaks so stored values can never inject extra headers. */
function headerValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Plain ASCII header text is used as is; anything else becomes RFC 2047
 * encoded words, split so each stays within the 75-character limit.
 */
function encodeHeaderText(value: string): string {
    const text = headerValue(value);
    if (/^[\x20-\x7e]*$/.test(text)) return text;
    const encoder = new TextEncoder();
    const words: string[] = [];
    let chunk = '';
    for (const char of text) {
        if (encoder.encode(chunk + char).length > 45) {
            words.push(chunk);
            chunk = '';
        }
        chunk += char;
    }
    if (chunk) words.push(chunk);
    return words.map((word) => `=?UTF-8?B?${toBase64(word)}?=`).join('\r\n ');
}

function toBase64(value: string): string {
    let binary = '';
    for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function toBase64Url(value: string): string {
    return toBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function wrapBase64(value: string): string {
    return value.replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');
}
