// Pure formatting helpers for comment emails. Kept free of Deno and network
// APIs so build-tools/email-dispatcher.test.mjs can load this file directly.

export type EmailSession = { name?: string; type?: string; startAt?: string; endAt?: string };

export type EmailPayload = {
    targetId?: string;
    targetType?: string;
    cc?: string[];
    message?: string;
    targetName?: string;
    requestSerial?: string;
    requestTitle?: string;
    requestMonthYear?: string;
    // Inventory requests only: the borrowing period as YYYY-MM-DD dates. The
    // dispatcher looks them up when it sends; program requests use their sessions.
    startDate?: string;
    endDate?: string;
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
    items?: Array<{ name?: string; quantity?: number; imageId?: string }>;
};

export type EmailOutboxRow = {
    id: string;
    recipient: string;
    payload: EmailPayload | null;
    attempts: number;
};

export type EmailSettings = {
    appUrl: string;
    // Public URL prefix of the image bucket. Photos are linked, never attached;
    // without a prefix an email simply has none.
    imageBaseUrl?: string;
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

// Email clients ignore stylesheets and most modern CSS, so the HTML part is
// table-based with inline styles only. Colours mirror the light theme tokens in
// frontend/input.css (clients cannot read CSS variables).
const MAIL = {
    paper: '#f6f5f4',
    surface: '#ffffff',
    ink: '#1a1a1a',
    charcoal: '#37352f',
    steel: '#787671',
    line: '#e5e3df',
    accent: '#d9480f',
    accentTint: '#ffe8d4',
    accentText: '#793400',
    font: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

const STATUS_CHIPS: Record<string, { bg: string; fg: string }> = {
    draft: { bg: '#fef7d6', fg: '#7a5b00' },
    submitted: { bg: '#dcecfa', fg: '#005bab' },
    approved: { bg: '#d9f3e1', fg: '#14782b' },
    rejected: { bg: '#fbeef0', fg: '#9b1c31' },
    cancelled: { bg: '#f0eeec', fg: '#37352f' },
};

export function formatEmailHtmlBody(
    message: string,
    payload: EmailPayload,
    settings: Pick<EmailSettings, 'appUrl' | 'timeZone' | 'imageBaseUrl'>,
): string {
    const authorName = payload.authorName || 'Setu Bot';
    const author = escapeHtml(authorName);
    const status = statusChange(payload);
    const title = payload.requestTitle || payload.targetName || 'Setu request';
    const requestUrl = requestUrlFor(payload, settings.appUrl);

    const rows: string[] = [];

    // Who did what.
    rows.push(
        row(
            `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
                `<td width="40" height="40" align="center" valign="middle" bgcolor="${MAIL.accentTint}" style="width:40px;height:40px;border-radius:20px;background:${MAIL.accentTint};color:${MAIL.accentText};font-size:16px;font-weight:700;line-height:40px;">${escapeHtml(initialOf(authorName))}</td>` +
                `<td style="padding-left:12px;font-size:15px;line-height:21px;color:${MAIL.charcoal};">` +
                `<strong style="color:${MAIL.ink};">${author}</strong><br>` +
                `<span style="color:${MAIL.steel};font-size:13px;">${status ? 'changed the status' : 'commented'}</span>` +
                `</td></tr></table>`,
            '24px 28px 0',
        ),
    );

    if (status) {
        rows.push(row(statusChips(payload), '16px 28px 0'));
        if (status.note) rows.push(row(quoteBlock(status.note, 'Note'), '12px 28px 0'));
    } else {
        rows.push(row(quoteBlock(message), '16px 28px 0'));
    }

    if (payload.sessions?.length) {
        const { timeZone } = settings;
        const sessionRows = payload.sessions
            .map((session) => {
                const part = sessionParts(session, timeZone);
                return (
                    `<tr><td style="padding:10px 0;border-top:1px solid ${MAIL.line};font-size:14px;line-height:20px;color:${MAIL.charcoal};">` +
                    (part.date
                        ? `<span style="color:${MAIL.steel};font-size:12px;">${escapeHtml(part.date)}</span><br>`
                        : '') +
                    `<strong style="color:${MAIL.ink};">${escapeHtml(part.time)}</strong>` +
                    `<span style="color:${MAIL.steel};"> &nbsp;·&nbsp; </span>${escapeHtml(part.label)}` +
                    `</td></tr>`
                );
            })
            .join('');
        rows.push(
            row(
                sectionHeading(formatSessionsHeading(payload.sessions, timeZone)) +
                    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${sessionRows}</table>` +
                    `<p style="margin:8px 0 0;font-size:12px;line-height:18px;color:${MAIL.steel};">${escapeHtml(formatTimeZoneLabel(timeZone, payload.sessions))}</p>`,
                '24px 28px 0',
            ),
        );
    }

    if (payload.items?.length) {
        const photos = payload.items.map((item) =>
            imageUrlFor(item.imageId, settings.imageBaseUrl),
        );
        // A photo column appears only when at least one item has a photo; the
        // others then get an empty tile so the rows stay aligned.
        const hasPhotos = photos.some(Boolean);
        const itemRows = payload.items
            .map((item, index) => {
                const cell = `padding:8px 0;border-top:1px solid ${MAIL.line};vertical-align:middle;`;
                const photo = photos[index];
                const tile = photo
                    ? `<img src="${escapeHtml(photo)}" alt="" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:6px;border:1px solid ${MAIL.line};object-fit:cover;">`
                    : `<div style="width:40px;height:40px;border-radius:6px;background:${MAIL.paper};border:1px solid ${MAIL.line};font-size:0;line-height:0;">&nbsp;</div>`;
                return (
                    `<tr>` +
                    (hasPhotos
                        ? `<td width="52" style="${cell}padding-right:12px;">${tile}</td>`
                        : '') +
                    `<td width="48" style="${cell}font-size:14px;font-weight:700;color:${MAIL.ink};white-space:nowrap;">${item.quantity || 0} ×</td>` +
                    `<td style="${cell}font-size:14px;color:${MAIL.charcoal};">${escapeHtml(item.name || 'Unnamed item')}</td></tr>`
                );
            })
            .join('');
        rows.push(
            row(
                sectionHeading('Inventory items') +
                    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${itemRows}</table>`,
                '24px 28px 0',
            ),
        );
    }

    rows.push(
        row(
            requestUrl
                ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
                      `<td bgcolor="${MAIL.accent}" style="border-radius:8px;background:${MAIL.accent};">` +
                      `<a href="${escapeHtml(requestUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">View request</a>` +
                      `</td></tr></table>`
                : `<p style="margin:0;font-size:14px;color:${MAIL.steel};">Open Setu to view the conversation.</p>`,
            '28px 28px 28px',
        ),
    );

    const subject = formatEmailSubject(payload);
    const serial = payload.requestSerial || 'Request';
    const dateRange =
        requestDateRange(payload, settings.timeZone) || payload.requestMonthYear || '';
    const preheader = status
        ? `${authorName} ${status.headline}.`
        : `${authorName}: ${message.replace(/\s+/g, ' ').trim()}`.slice(0, 140);

    return (
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
        `<title>${escapeHtml(subject)}</title></head>` +
        `<body style="margin:0;padding:0;background:${MAIL.paper};font-family:${MAIL.font};">` +
        `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}</div>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL.paper}" style="background:${MAIL.paper};"><tr><td align="center" style="padding:24px 12px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">` +
        `<tr><td style="padding:0 4px 12px;font-size:13px;font-weight:700;letter-spacing:0.14em;color:${MAIL.accent};">SETU</td></tr>` +
        `<tr><td style="background:${MAIL.surface};border:1px solid ${MAIL.line};border-top:4px solid ${MAIL.accent};border-radius:12px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
        row(
            `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${MAIL.paper};border:1px solid ${MAIL.line};font-size:12px;font-weight:600;color:${MAIL.charcoal};">${escapeHtml(serial)}</span>` +
                (dateRange
                    ? `<span style="font-size:13px;color:${MAIL.steel};"> &nbsp;${escapeHtml(dateRange)}</span>`
                    : '') +
                `<h1 style="margin:12px 0 0;font-size:21px;line-height:28px;font-weight:700;color:${MAIL.ink};">${escapeHtml(title)}</h1>`,
            '28px 28px 20px',
        ) +
        `<tr><td style="padding:0 28px;"><div style="border-top:1px solid ${MAIL.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>` +
        rows.join('') +
        `</table></td></tr>` +
        `<tr><td align="center" style="padding:16px 8px 0;font-size:12px;line-height:18px;color:${MAIL.steel};">Sent by Setu. Replies to this email go to the Setu team.</td></tr>` +
        `</table></td></tr></table></body></html>`
    );
}

/**
 * The request's own dates for the email header: an inventory request's
 * borrowing period, or the span of a program's sessions. Empty when neither is
 * known. Same day: "4 Sep 2026"; same month: "4 – 6 Sep 2026".
 */
export function requestDateRange(payload: EmailPayload, timeZone: string): string {
    let start: Date | null;
    let end: Date | null;
    let zone = timeZone;
    if (payload.startDate) {
        // Plain calendar dates carry no time zone; read them as UTC midnights.
        start = parseSessionDate(`${payload.startDate}T00:00:00Z`);
        end = parseSessionDate(`${payload.endDate || payload.startDate}T00:00:00Z`);
        zone = 'UTC';
    } else {
        const dates = (payload.sessions || [])
            .flatMap((session) => [
                parseSessionDate(session.startAt),
                parseSessionDate(session.endAt),
            ])
            .filter((date): date is Date => Boolean(date))
            .sort((left, right) => left.getTime() - right.getTime());
        start = dates[0] || null;
        end = dates[dates.length - 1] || null;
    }
    if (!start || !end) return '';
    const first = dateParts(start, zone);
    const last = dateParts(end, zone);
    const firstDay = `${first.day} ${first.month}`;
    const lastDay = `${last.day} ${last.month}`;
    if (first.year !== last.year) return `${firstDay} ${first.year} – ${lastDay} ${last.year}`;
    if (firstDay === lastDay) return `${firstDay} ${first.year}`;
    if (first.month === last.month)
        return `${first.day} – ${last.day} ${first.month} ${first.year}`;
    return `${firstDay} – ${lastDay} ${first.year}`;
}

/** The public URL of a stored photo, or '' when there is none to link. */
export function imageUrlFor(imageId: string | undefined, baseUrl: string | undefined): string {
    const path = (imageId || '').trim();
    const base = (baseUrl || '').trim();
    if (!path || !/^https:\/\//.test(base)) return '';
    return base.replace(/\/?$/, '/') + path.split('/').map(encodeURIComponent).join('/');
}

/** An inventory type's display name, matching the one the email queue stores. */
export function inventoryItemLabel(type: {
    brand?: string;
    name?: string;
    model?: string;
}): string {
    return [type.brand, type.name, type.model]
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join(' · ');
}

export type RequestDetails = {
    startDate?: string;
    endDate?: string;
    photos: Array<{ label: string; imageId: string }>;
};

/** Merges what the dispatcher looked up at send time into the stored payload. */
export function withRequestDetails(payload: EmailPayload, details: RequestDetails): EmailPayload {
    const imageByLabel = new Map(details.photos.map((photo) => [photo.label, photo.imageId]));
    return {
        ...payload,
        ...(details.startDate ? { startDate: details.startDate } : {}),
        ...(details.endDate ? { endDate: details.endDate } : {}),
        ...(payload.items
            ? {
                  items: payload.items.map((item) => ({
                      ...item,
                      imageId: imageByLabel.get(item.name || '') || undefined,
                  })),
              }
            : {}),
    };
}

function row(content: string, padding: string): string {
    return `<tr><td style="padding:${padding};">${content}</td></tr>`;
}

function sectionHeading(text: string): string {
    return `<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MAIL.steel};">${escapeHtml(text)}</p>`;
}

function quoteBlock(text: string, label?: string): string {
    return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td style="padding:14px 16px;background:${MAIL.paper};border-left:3px solid ${MAIL.accent};border-radius:6px;font-size:15px;line-height:23px;color:${MAIL.ink};">` +
        (label
            ? `<span style="display:block;margin-bottom:4px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MAIL.steel};">${escapeHtml(label)}</span>`
            : '') +
        `${escapeHtml(text).replace(/\n/g, '<br>')}</td></tr></table>`
    );
}

function statusChip(value: string): string {
    const colours = STATUS_CHIPS[value.toLowerCase()] || { bg: '#f0eeec', fg: MAIL.charcoal };
    const label = value.charAt(0).toUpperCase() + value.slice(1);
    return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${colours.bg};color:${colours.fg};font-size:13px;font-weight:700;">${escapeHtml(label)}</span>`;
}

function statusChips(payload: EmailPayload): string {
    const arrow = `<span style="color:${MAIL.steel};font-size:16px;"> &nbsp;&rarr;&nbsp; </span>`;
    return (
        (payload.statusFrom ? statusChip(payload.statusFrom) + arrow : '') +
        statusChip(payload.statusTo || '')
    );
}

function initialOf(name: string): string {
    return (Array.from(name.trim())[0] || '?').toUpperCase();
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
    const { date, time, label } = sessionParts(session, timeZone);
    return `${date ? `(${date}) ` : ``}${time} | ${label}`;
}

/** A session split into its date ("Sat, 5 Sep"), time range and label. */
export function sessionParts(
    session: EmailSession,
    timeZone: string,
): { date: string; time: string; label: string } {
    const start = parseSessionDate(session.startAt);
    const end = parseSessionDate(session.endAt);
    const day = start || end;
    let date = '';
    if (day) {
        const parts = dateParts(day, timeZone);
        date = `${parts.weekday}, ${parts.day} ${parts.month}`;
    }
    const startText = start ? formatTime(start, timeZone) : session.startAt || '';
    const endText = end ? formatTime(end, timeZone) : session.endAt || '';
    return {
        date,
        time: `${startText} - ${endText}`,
        label: session.name || session.type || 'Session',
    };
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
