// Demo server: the real frontend, signed in as a fictional administrator and
// backed by the invented data in demo-data.mjs instead of Supabase. It exists
// for screenshots and demos (npm run demo) — nothing here touches a real
// project or needs credentials. Request approvals and comments work in memory;
// every other change fails.
//
// One origin plays three parts: it serves the app, answers the Edge Function
// endpoint the app calls (/functions/v1/api/<operation>), and hands the app a
// pre-made session through localStorage so no sign-in is needed.
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { compileCss, esbuildOptions, renderShell, devFaviconTag } from './shell.mjs';
import * as data from './demo-data.mjs';

const PORT = Number(process.env.PORT) || 47195;
const ORIGIN = `http://localhost:${PORT}`;

// --- API -------------------------------------------------------------------

const PAGE_SIZE = 25;
const includes = (value, q) => String(value).toLowerCase().includes(String(q).toLowerCase());

function page(rows, pageNumber) {
    const start = (pageNumber - 1) * PAGE_SIZE;
    return {
        items: rows.slice(start, start + PAGE_SIZE),
        page: pageNumber,
        pageSize: PAGE_SIZE,
        totalCount: rows.length,
    };
}

function filterRequests(rows, query = {}, searchFields) {
    const { q, statuses, departmentId, requesterEmail } = query;
    return rows.filter(
        (r) =>
            (!q || searchFields.some((f) => includes(r[f], q))) &&
            (!statuses?.length || statuses.includes(r.Status)) &&
            (!departmentId || r.DepartmentId === departmentId) &&
            (!requesterEmail || r.UserId === requesterEmail),
    );
}

function inventoryList(pageNumber, query = {}) {
    const base = filterRequests(data.inventoryRequests, { ...query, statuses: [] }, [
        'Name',
        'userName',
    ]);
    const statusCounts = {};
    for (const r of base) statusCounts[r.Status] = (statusCounts[r.Status] || 0) + 1;
    const rows = filterRequests(base, query, []).filter(
        (r) =>
            (!query.inventoryTypeId ||
                r.items.some((i) => i.InventoryTypeId === query.inventoryTypeId)) &&
            (!query.labelId || r.items.some((i) => i.labels.some((l) => l.Id === query.labelId))),
    );
    rows.sort((a, b) => b.DisplayId - a.DisplayId);
    return { ...page(rows, pageNumber), statusCounts };
}

function programList(pageNumber, query = {}) {
    const rows = filterRequests(data.programRequests, query, ['Name', 'userName']).filter(
        (r) => !query.placeId || r.PlaceId === query.placeId,
    );
    rows.sort((a, b) => a.sessionStart.localeCompare(b.sessionStart));
    return page(rows, pageNumber);
}

// The home screen's data only (DashboardPayload): reference data has its own
// operations below. Mirrors the real dashboard: the requests that need attention
// with their true totals, and the newest comments of each kind.
const ONGOING_INVENTORY = ['draft', 'submitted', 'approved', 'issued'];
const byNewest = (a, b) => String(b.Timestamp).localeCompare(String(a.Timestamp));

function dashboard() {
    const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]));
    const pending = data.programRequests.filter((r) => ['draft', 'submitted'].includes(r.Status));
    const ongoing = data.inventoryRequests.filter((r) => ONGOING_INVENTORY.includes(r.Status));
    const recent = (kind, rows) =>
        rows
            .flatMap((request) =>
                request.comments
                    .filter((comment) => comment.Kind === 'comment')
                    .map((comment) => ({
                        kind,
                        request: pick(request, ['Id', 'DisplayId', 'Name']),
                        comment,
                    })),
            )
            .sort((a, b) => byNewest(a.comment, b.comment))
            .slice(0, 8);
    return {
        upcomingRosters: data.rosters,
        pendingProgramRequests: pending.map((r) =>
            pick(r, [
                'Id',
                'DisplayId',
                'Name',
                'Status',
                'userName',
                'sessionStart',
                'sessionEnd',
            ]),
        ),
        pendingProgramCount: pending.length,
        ongoingInventoryRequests: ongoing.map((r) =>
            pick(r, ['Id', 'DisplayId', 'Name', 'Status', 'userName', 'StartDate', 'EndDate']),
        ),
        ongoingInventoryCount: ongoing.length,
        recentComments: [
            ...recent('programs', data.programRequests),
            ...recent('inventory', data.inventoryRequests),
        ],
    };
}

const operations = {
    whoAmI: () => data.me,
    getDashboard: dashboard,
    listUsers: () => data.users,
    listDepartments: () => data.departments,
    listPlaces: () => data.places,
    listInventoryBrands: () => data.inventoryBrands,
    listInventoryPlaces: () => data.inventoryPlaces,
    listInventoryTypes: () => data.inventoryTypes,
    listBlocks: () => data.blocks,
    getHomeContent: () => data.homeContent,
    getSettings: () => ({
        guidelines: data.homeContent.Guidelines,
        shiftTypes: data.shiftTypes,
        programTypes: data.programTypes,
        programLanguages: data.programLanguages,
        sessionTypes: data.sessionTypes,
    }),
    listAllowedEmailDomains: () => data.allowedEmailDomains,
    listRosters: (p = 1) => page(data.rosters, p),
    listInventoryRequests: inventoryList,
    getInventoryRequest: (id) => data.inventoryRequests.find((r) => r.Id === id),
    listProgramRequests: programList,
    getProgramRequest: (id) => data.programRequests.find((r) => r.Id === id),
    getAvailablePlaces: () => data.places,
    getCalendarMonth: () => ({
        places: data.places,
        programs: data.programRequests.filter((r) => r.Status === 'approved'),
    }),
    getImageUrl: () => '',
};

// The only writes the demo accepts: workflow actions (approve, reject, ...),
// comments and the hidden views. They change the in-memory data, so a demo can
// approve a request and show the new status; everything resets when the server
// restarts.
const ACTION_STATUS = {
    submit: 'submitted',
    approve: 'approved',
    reject: 'rejected',
    issue: 'issued',
    cancel: 'cancelled',
    close: 'closed',
    revise: 'draft',
    unapprove: 'submitted',
    reopen: 'approved',
};

function addComment(request, Message, event) {
    const comment = {
        Id: `${request.Id}-c${request.comments.length + 1}`,
        Timestamp: new Date().toISOString(),
        RequestId: request.Id,
        UserId: data.me.Email,
        Message,
        Kind: event?.Kind ?? 'comment',
        Data: event?.Data ?? null,
        userName: data.me.Name,
    };
    request.comments.push(comment);
    return comment;
}

function performAction(rows) {
    return (requestId, action, note) => {
        const request = rows.find((r) => r.Id === requestId);
        const status = ACTION_STATUS[action];
        if (!request || !status) return undefined;
        const from = request.Status;
        request.Status = status;
        addComment(request, note || `Status changed to ${status}.`, {
            Kind: 'status',
            Data: { from, to: status, action, note: note || null },
        });
        return status;
    };
}

const writes = {
    performProgramRequestAction: performAction(data.programRequests),
    performInventoryRequestAction: performAction(data.inventoryRequests),
    updateHomeContent: (input) => {
        if (Array.isArray(input.hiddenViews)) data.homeContent.HiddenViews = input.hiddenViews;
        if (Array.isArray(input.viewOrder)) data.homeContent.ViewOrder = input.viewOrder;
        return data.homeContent;
    },
    addComment: (requestId, message) => {
        const request = [...data.programRequests, ...data.inventoryRequests].find(
            (r) => r.Id === requestId,
        );
        return request ? addComment(request, message) : undefined;
    },
};

function handleOperation(name, args) {
    const operation = operations[name] ?? writes[name];
    if (operation) {
        const result = operation(...args);
        if (result === undefined) return { status: 404, body: { error: 'Not found.' } };
        return { status: 200, body: result };
    }
    return {
        status: 403,
        body: { error: 'This is a demo: only approvals and comments can be changed.' },
    };
}

// --- Page ------------------------------------------------------------------

// supabase-js reads the session from localStorage before it makes any request.
// The key is derived from the project URL's first hostname label.
const SESSION_KEY = 'sb-localhost-auth-token';

function sessionSeed() {
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
    const session = {
        access_token: 'demo-access-token',
        refresh_token: 'demo-refresh-token',
        token_type: 'bearer',
        expires_in: 10 * 365 * 24 * 3600,
        expires_at: expiresAt,
        user: {
            id: '00000000-0000-4000-8000-000000000001',
            aud: 'authenticated',
            role: 'authenticated',
            email: data.me.Email,
            app_metadata: { provider: 'google' },
            user_metadata: { full_name: data.me.Name },
            created_at: new Date().toISOString(),
        },
    };
    return `<script>try{localStorage.setItem(${JSON.stringify(SESSION_KEY)},${JSON.stringify(
        JSON.stringify(session),
    )});}catch(e){}</script>`;
}

const out = mkdtempSync(path.join(tmpdir(), 'setu-demo-'));
const cssFile = path.join(out, 'app.css');
compileCss(cssFile);
const built = await esbuild.build({
    ...esbuildOptions('prod'),
    define: {
        __SETU_SUPABASE_URL__: JSON.stringify(ORIGIN),
        __SETU_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify('demo-publishable-key'),
    },
});
// Same escaping the dev shell applies, so the bundle is safe in an inline tag.
const script = built.outputFiles[0].text
    .replace(/<\/script/gi, '<\\/script')
    .replaceAll('<!--', '\\x3c!--');
const html = renderShell({
    title: 'Setu',
    favicon: devFaviconTag(),
    head: `<style>${readFileSync(cssFile, 'utf8')}</style>`,
    body: `${sessionSeed()}<script>${script}</script>`,
});

const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, ORIGIN);
    const operation = /^\/functions\/v1\/api\/([A-Za-z]+)$/.exec(pathname)?.[1];
    if (operation && req.method === 'POST') {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
            let args = [];
            try {
                args = JSON.parse(raw || '{}').args ?? [];
            } catch {
                // An unreadable body just means no arguments.
            }
            const { status, body } = handleOperation(operation, args);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        });
        return;
    }
    // Anything that is not an API call gets the app, so client routes work and
    // no service worker or manifest is registered for the demo.
    if (pathname === '/sw.js') {
        res.writeHead(404).end();
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
});

server.on('error', (err) => {
    console.error(
        err.code === 'EADDRINUSE' ? `[demo] port ${PORT} is in use` : `[demo] ${err.message}`,
    );
    process.exit(1);
});
server.listen(PORT, () => console.log(`[demo] fictional data, no Supabase: ${ORIGIN}`));
