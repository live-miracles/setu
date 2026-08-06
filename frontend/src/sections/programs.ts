import { api } from '../api';
import { PROGRAM_REQUEST_QUERY_PARAM, WORKBENCH_MODE_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import {
    navigateToProgram,
    navigateToProgramCreate,
    navigateToPrograms,
    refreshDashboard,
} from '../router';
import {
    namePill,
    renderDetailCommandHeader,
    renderEmptyState,
    renderRequestActivityPanel,
    renderRequestDetailPage,
    renderRequestDisplayTitle,
    renderRequestEditableField,
    renderRequestFieldGrid,
    renderRequestLineSection,
    renderRequestReadonlyFields,
    renderRequestRecordPanel,
    renderRequestTitleInput,
    renderWorkbenchHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml, formatDateTime } from '../ui/format';
import { icon } from '../ui/icons';
import { PROGRAM_REQUEST_ACTION_BTN, PROGRAM_REQUEST_STATUS_BADGE } from '../ui/styles';
import { canApprove, canTransitionProgramRequest } from '../workflows';
import {
    type WorkbenchState,
    type WorkbenchToolbarConfig,
    readWorkbenchState,
    renderWorkbenchToolbar,
    wireSortableHeaders,
    wireWorkbenchToolbar,
    workItemHref,
} from '../workbench';

const PROGRAM_REQUEST_VIEW_STORAGE_KEY = 'setu.programs.requestView';

const PROGRAM_REQUEST_ACTION_LABELS: Record<ProgramRequestAction, string> = {
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    cancel: 'Cancel',
};

const PROGRAM_NEXT_STATUS_LABELS: Record<ProgramRequestStatus, string[]> = {
    draft: ['Submitted', 'Cancelled'],
    submitted: ['Approved', 'Rejected', 'Cancelled'],
    approved: [],
    rejected: [],
    cancelled: [],
};

const PROGRAM_STATUS_STEPS: { status: ProgramRequestStatus; label: string }[] = [
    { status: 'draft', label: 'Draft' },
    { status: 'submitted', label: 'Submit for Approval' },
    { status: 'approved', label: 'Approved' },
    { status: 'rejected', label: 'Rejected' },
    { status: 'cancelled', label: 'Cancelled' },
];

function programStatusSteps(status: ProgramRequestStatus): { label: string; active: boolean }[] {
    return PROGRAM_STATUS_STEPS.map((step) => ({
        label: step.label,
        active: step.status === status,
    }));
}

const PROGRAM_BOARD_COLUMNS: {
    id: string;
    title: string;
    description: string;
    statuses: ProgramRequestStatus[];
}[] = [
    { id: 'draft', title: 'Draft', description: 'Not yet submitted', statuses: ['draft'] },
    {
        id: 'needs-approval',
        title: 'Needs approval',
        description: 'Waiting for a decision',
        statuses: ['submitted'],
    },
    { id: 'approved', title: 'Approved', description: 'Ready to deliver', statuses: ['approved'] },
    {
        id: 'not-proceeding',
        title: 'Not proceeding',
        description: 'Rejected or cancelled',
        statuses: ['rejected', 'cancelled'],
    },
];

function toolbarConfig(dashboard: DashboardPayload): WorkbenchToolbarConfig {
    void dashboard;
    return {
        storageKey: PROGRAM_REQUEST_VIEW_STORAGE_KEY,
        searchPlaceholder: 'Search programs, people, places or sessions',
        statuses: [
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Needs approval' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'cancelled', label: 'Cancelled' },
        ],
        defaultSort: 'id',
    };
}

export async function renderPrograms(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const programId = params.get(PROGRAM_REQUEST_QUERY_PARAM);
    if (programId) {
        try {
            renderProgramDetail(container, dashboard, await api.getProgramRequest(programId));
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('clapper', 'This program could not be opened.');
        }
        return;
    }
    if (params.get(WORKBENCH_MODE_QUERY_PARAM) === 'create') {
        renderProgramCreate(container, dashboard);
        return;
    }
    renderProgramWorkbench(container, dashboard);
}

function renderProgramWorkbench(container: HTMLElement, dashboard: DashboardPayload): void {
    const config = toolbarConfig(dashboard);
    const state = readWorkbenchState(config);
    container.innerHTML = `
      <section class="workbench-page m-3 h-[calc(100%-1.5rem)]">
        ${renderWorkbenchHeader(
            'Programs',
            `<button type="button" id="new-program" class="btn btn-primary btn-sm">New</button>`,
        )}
        ${renderWorkbenchToolbar(config, state)}
        <div id="program-results" class="min-h-0" aria-live="polite"></div>
      </section>`;
    document.getElementById('new-program')!.addEventListener('click', navigateToProgramCreate);
    wireWorkbenchToolbar(config, state, (next) => void loadProgramResults(dashboard, next));
    void loadProgramResults(dashboard, state);
}

function programQuery(
    state: WorkbenchState,
    statuses?: ProgramRequestStatus[],
): ProgramRequestQuery {
    return {
        q: state.q,
        statuses: state.status ? [state.status as ProgramRequestStatus] : statuses,
        sortBy: state.sort as ProgramRequestQuery['sortBy'],
        sortDirection: state.direction,
    };
}

async function loadProgramResults(
    dashboard: DashboardPayload,
    state: WorkbenchState,
): Promise<void> {
    const generation = ++programResultsGeneration;
    const host = document.getElementById('program-results');
    if (!host) return;
    host.innerHTML =
        '<div class="workbench-loading"><span class="loading loading-spinner loading-sm"></span> Loading programs…</div>';
    try {
        if (state.view === 'board') await renderProgramBoard(host, dashboard, state, generation);
        else await renderProgramList(host, dashboard, state, generation);
    } catch (err) {
        if (generation !== programResultsGeneration) return;
        host.innerHTML = '<div class="alert alert-error">Programs could not be loaded.</div>';
        showErrorAlert(err);
    }
}

let programResultsGeneration = 0;

async function renderProgramBoard(
    host: HTMLElement,
    dashboard: DashboardPayload,
    state: WorkbenchState,
    generation: number,
): Promise<void> {
    const columns = PROGRAM_BOARD_COLUMNS.filter(
        (column) => !state.status || column.statuses.includes(state.status as ProgramRequestStatus),
    );
    const results = await Promise.all(
        columns.map((column) => api.listProgramRequests(1, programQuery(state, column.statuses))),
    );
    if (generation !== programResultsGeneration || !host.isConnected) return;
    host.innerHTML = `<div class="workbench-board">${columns
        .map((column, index) => renderProgramColumn(column, results[index], index))
        .join('')}</div>`;
    wireProgramLinks(host);
    host.querySelectorAll<HTMLButtonElement>('[data-load-program-column]').forEach((button) => {
        button.addEventListener('click', async () => {
            const columnIndex = Number(button.dataset.loadProgramColumn);
            const nextPage = Number(button.dataset.nextPage);
            const result = await api.listProgramRequests(
                nextPage,
                programQuery(state, columns[columnIndex].statuses),
            );
            button.insertAdjacentHTML(
                'beforebegin',
                result.items.map(renderProgramBoardCard).join(''),
            );
            wireProgramLinks(button.closest('.workbench-column')!);
            const loaded = nextPage * result.pageSize;
            if (loaded >= result.totalCount) button.remove();
            else button.dataset.nextPage = String(nextPage + 1);
        });
    });
}

function renderProgramColumn(
    column: (typeof PROGRAM_BOARD_COLUMNS)[number],
    result: Paginated<ProgramRequestDTO>,
    index: number,
): string {
    const content = result.items.length
        ? result.items.map(renderProgramBoardCard).join('')
        : '<div class="workbench-empty-column">No programs</div>';
    return `<section class="workbench-column" aria-labelledby="program-column-${column.id}">
      <header class="workbench-column-heading">
        <div><h2 id="program-column-${column.id}">${escapeHtml(column.title)}</h2><p>${escapeHtml(column.description)}</p></div>
        <span class="badge badge-ghost badge-sm">${result.totalCount}</span>
      </header>
      <div class="workbench-column-items">${content}</div>
      ${result.items.length < result.totalCount ? `<button type="button" class="btn btn-ghost btn-sm w-full" data-load-program-column="${index}" data-next-page="2">Load more</button>` : ''}
    </section>`;
}

function renderProgramBoardCard(request: ProgramRequestDTO): string {
    const first = request.sessions[0];
    const last = request.sessions[request.sessions.length - 1];
    return `<a class="workbench-card" href="${workItemHref(PROGRAM_REQUEST_QUERY_PARAM, request.Id)}" data-program-id="${request.Id}">
      <div class="workbench-card-top"><span class="font-mono">PRG-${request.DisplayId}</span><span class="badge badge-xs ${PROGRAM_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span></div>
      <h3>${escapeHtml(request.Name)}</h3>
      <p>${escapeHtml(request.Type)} · ${escapeHtml(request.placeName)}</p>
      ${first ? `<p>${formatDateTime(first.StartDateTime)}${last && last !== first ? ` → ${formatDateTime(last.EndDateTime)}` : ''}</p>` : ''}
      <p>${escapeHtml(request.userName)}</p>
    </a>`;
}

async function renderProgramList(
    host: HTMLElement,
    dashboard: DashboardPayload,
    state: WorkbenchState,
    generation: number,
): Promise<void> {
    const result = await api.listProgramRequests(1, programQuery(state));
    if (generation !== programResultsGeneration || !host.isConnected) return;
    host.innerHTML = `<div class="workbench-table-wrap">
      <table class="workbench-table">
        <thead><tr>
          ${sortHeader('Program', 'name', state)}
          ${sortHeader('Place & type', 'place', state)}
          ${sortHeader('Sessions', 'sessionStart', state)}
          ${sortHeader('Requested by', 'requester', state)}
          ${sortHeader('Status', 'status', state)}
        </tr></thead>
        <tbody id="program-list-body">${result.items.map(renderProgramListRow).join('')}</tbody>
      </table>
      ${result.items.length === 0 ? renderEmptyState('clapper', 'No programs match these filters.') : ''}
      ${result.items.length < result.totalCount ? `<button type="button" id="load-more-programs" class="btn btn-ghost btn-sm mt-3">Load more (${result.totalCount - result.items.length})</button>` : ''}
    </div>`;
    wireProgramLinks(host);
    wireSortableHeaders(state, (next) => void loadProgramResults(dashboard, next));
    document.getElementById('load-more-programs')?.addEventListener('click', async (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const nextPage = Number(button.dataset.page || '2');
        const next = await api.listProgramRequests(nextPage, programQuery(state));
        document
            .getElementById('program-list-body')!
            .insertAdjacentHTML('beforeend', next.items.map(renderProgramListRow).join(''));
        wireProgramLinks(host);
        if (nextPage * next.pageSize >= next.totalCount) button.remove();
        else button.dataset.page = String(nextPage + 1);
    });
}

function sortHeader(label: string, sort: string, state: WorkbenchState): string {
    const marker = state.sort === sort ? (state.direction === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th><button type="button" data-workbench-sort="${sort}">${escapeHtml(label)}${marker}</button></th>`;
}

function renderProgramListRow(request: ProgramRequestDTO): string {
    const first = request.sessions[0];
    const last = request.sessions[request.sessions.length - 1];
    return `<tr>
      <td data-label="Program"><a href="${workItemHref(PROGRAM_REQUEST_QUERY_PARAM, request.Id)}" data-program-id="${request.Id}"><span class="font-mono text-xs">PRG-${request.DisplayId}</span><strong>${escapeHtml(request.Name)}</strong></a></td>
      <td data-label="Place & type">${escapeHtml(request.placeName)}<small>${escapeHtml(request.Type)}</small></td>
      <td data-label="Sessions">${request.sessions.length} session${request.sessions.length === 1 ? '' : 's'}${first ? `<small>${formatDateTime(first.StartDateTime)}${last && last !== first ? ` → ${formatDateTime(last.EndDateTime)}` : ''}</small>` : ''}</td>
      <td data-label="Requested by">${escapeHtml(request.userName)}</td>
      <td data-label="Status"><span class="badge badge-sm ${PROGRAM_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span></td>
    </tr>`;
}

function wireProgramLinks(root: ParentNode): void {
    root.querySelectorAll<HTMLAnchorElement>('a[data-program-id]').forEach((link) => {
        if (link.dataset.wired) return;
        link.dataset.wired = 'true';
        link.addEventListener('click', (event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigateToProgram(link.dataset.programId!);
        });
    });
}

function renderProgramCreate(container: HTMLElement, dashboard: DashboardPayload): void {
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-programs',
        backLabel: 'Back to programs',
        eyebrow: 'Program request',
        reference: 'New',
        title: 'New program request',
        statusHtml: '<span class="badge badge-ghost">draft</span>',
        nextStatuses: PROGRAM_NEXT_STATUS_LABELS.draft,
        statusSteps: programStatusSteps('draft'),
        actionsHtml:
            '<button type="submit" form="create-program-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-program" class="btn btn-ghost btn-sm">Cancel</button>',
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: [
                renderRequestEditableField(
                    'Program type',
                    '<input id="program-type" name="type" class="input input-sm" placeholder="e.g. Livestream" required />',
                ),
                renderRequestEditableField(
                    'Place',
                    `<select id="program-place" name="placeId" class="select select-sm" required><option value="">Select place</option>${dashboard.places.map((place) => `<option value="${place.Id}">${escapeHtml(place.Name)}</option>`).join('')}</select>`,
                ),
                renderRequestEditableField(
                    'Participants',
                    '<input id="program-participants" name="participants" class="input input-sm" placeholder="email1, email2" />',
                ),
            ],
        },
        {
            title: 'Requester info',
            rows: [
                renderRequestReadonlyFields([
                    { label: 'Requester', valueHtml: escapeHtml(dashboard.me.Name) },
                    {
                        label: 'Department',
                        valueHtml: escapeHtml(dashboard.me.departmentName || ''),
                    },
                    { label: 'Email', valueHtml: escapeHtml(dashboard.me.Email) },
                ]),
            ],
        },
    ]);
    const sessions = renderRequestLineSection(
        'Sessions',
        `<div id="program-sessions" class="request-line-list"></div><button type="button" id="add-program-session" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add session</button>`,
        'Reservations should include at least one session before saving.',
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        renderRequestRecordPanel(
            `${renderRequestTitleInput('program-name', 'name', 'Program title')}${fields}${sessions}`,
            'form',
            'id="create-program-form"',
        ),
        renderRequestActivityPanel({ createMode: true }),
        true,
    );
    document.getElementById('back-to-programs')!.addEventListener('click', navigateToPrograms);
    document.getElementById('cancel-program')!.addEventListener('click', navigateToPrograms);
    wireSessionRows();
    wireCreateProgramForm();
}

function wireSessionRows(): void {
    const list = document.getElementById('program-sessions')!;
    const addButton = document.getElementById('add-program-session')!;
    const addRow = () => {
        const row = document.createElement('div');
        row.className = 'program-session-row';
        row.innerHTML = `<input class="input input-sm" name="sessionType" placeholder="Session type" required /><input type="datetime-local" class="input input-sm" name="startDateTime" required /><input type="datetime-local" class="input input-sm" name="endDateTime" required /><input class="input input-sm" name="sessionName" placeholder="Session title" required /><button type="button" class="btn btn-ghost btn-sm remove-row" aria-label="Remove session">✕</button>`;
        row.querySelector('.remove-row')!.addEventListener('click', () => row.remove());
        list.appendChild(row);
    };
    addButton.addEventListener('click', addRow);
    addRow();
}

function wireCreateProgramForm(): void {
    const form = document.getElementById('create-program-form') as HTMLFormElement;
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const sessions = Array.from(form.querySelectorAll('.program-session-row')).map((row) => {
            const value = (name: string) =>
                (row.querySelector(`[name="${name}"]`) as HTMLInputElement).value;
            return {
                name: value('sessionName'),
                type: value('sessionType'),
                startDateTime: value('startDateTime')
                    ? new Date(value('startDateTime')).toISOString()
                    : '',
                endDateTime: value('endDateTime')
                    ? new Date(value('endDateTime')).toISOString()
                    : '',
            };
        });
        try {
            showSavingBadge(true);
            const created = await api.createProgramRequest(
                {
                    name: String(data.get('name')),
                    type: String(data.get('type')),
                    placeId: String(data.get('placeId')),
                    sessions,
                    participants: String(data.get('participants') || ''),
                },
                generateRequestId(),
            );
            navigateToProgram(created.Id);
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function availableProgramActions(
    request: ProgramRequestDTO,
    dashboard: DashboardPayload,
): ProgramRequestAction[] {
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    const approver = canApprove(dashboard.me);
    return (['submit', 'approve', 'reject', 'cancel'] as ProgramRequestAction[]).filter(
        (action) =>
            canTransitionProgramRequest(request.Status, action) &&
            (action === 'submit' ? owner : approver),
    );
}

function renderProgramDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    request: ProgramRequestDTO,
): void {
    const actions = availableProgramActions(request, dashboard);
    const actionControls = renderProgramDetailActions(request.Status, actions);
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-programs',
        backLabel: 'Back to programs',
        eyebrow: 'Program request',
        reference: `PRG-${request.DisplayId}`,
        title: request.Name,
        statusHtml: `<span class="badge ${PROGRAM_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span>`,
        nextStatuses: PROGRAM_NEXT_STATUS_LABELS[request.Status],
        statusSteps: programStatusSteps(request.Status),
        actionsHtml: actionControls,
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: [
                renderRequestReadonlyFields([
                    { label: 'Type', valueHtml: escapeHtml(request.Type) },
                    { label: 'Place', valueHtml: escapeHtml(request.placeName) },
                    {
                        label: 'Participants',
                        valueHtml: request.participants.length
                            ? request.participants.map(namePill).join('')
                            : 'None',
                    },
                ]),
            ],
        },
        {
            title: 'Requester info',
            rows: [
                renderRequestReadonlyFields([
                    { label: 'Requested by', valueHtml: escapeHtml(request.userName) },
                    { label: 'Status', valueHtml: escapeHtml(request.Status) },
                ]),
            ],
        },
    ]);
    const sessions = renderRequestLineSection(
        'Sessions',
        `<div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Name</th><th>Type</th><th>Start</th><th>End</th></tr></thead><tbody>${request.sessions.map((session) => `<tr><td>${escapeHtml(session.Name)}</td><td>${escapeHtml(session.Type)}</td><td>${formatDateTime(session.StartDateTime)}</td><td>${formatDateTime(session.EndDateTime)}</td></tr>`).join('')}</tbody></table></div>`,
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        renderRequestRecordPanel(`${renderRequestDisplayTitle(request.Name)}${fields}${sessions}`),
        renderRequestActivityPanel({
            comments: request.comments,
            commentFormId: 'request-comment-form',
        }),
        actions.length > 0,
    );
    document.getElementById('back-to-programs')!.addEventListener('click', navigateToPrograms);
    document
        .querySelectorAll<HTMLButtonElement>('[data-program-action]')
        .forEach((button) =>
            button.addEventListener(
                'click',
                () =>
                    void handleProgramRequestAction(
                        request.Id,
                        button.dataset.programAction as ProgramRequestAction,
                    ),
            ),
        );
    document
        .getElementById('request-comment-form')!
        .addEventListener('submit', (event) => void submitProgramComment(event, request.Id));
}

function renderProgramDetailActions(
    status: ProgramRequestStatus,
    actions: ProgramRequestAction[],
): string {
    if (actions.length === 0) return '';
    const primaryByStatus: Partial<Record<ProgramRequestStatus, ProgramRequestAction>> = {
        draft: 'submit',
        submitted: 'approve',
    };
    const overflow = actions.filter((action) => action === 'cancel');
    const visible = actions.filter((action) => action !== 'cancel');
    return `${visible
        .map(
            (action) =>
                `<button type="button" class="btn btn-sm ${action === primaryByStatus[status] ? 'btn-primary' : PROGRAM_REQUEST_ACTION_BTN[action]}" data-program-action="${action}">${PROGRAM_REQUEST_ACTION_LABELS[action]}</button>`,
        )
        .join('')}${renderProgramActionMenu(overflow)}`;
}

function renderProgramActionMenu(actions: ProgramRequestAction[]): string {
    if (actions.length === 0) return '';
    return `<details class="dropdown dropdown-end"><summary class="btn btn-ghost btn-sm">More</summary><ul class="menu dropdown-content w-40 rounded-box p-2">${actions.map((action) => `<li><button type="button" data-program-action="${action}">${PROGRAM_REQUEST_ACTION_LABELS[action]}</button></li>`).join('')}</ul></details>`;
}

async function submitProgramComment(event: Event, requestId: string): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const message = (form.elements.namedItem('message') as HTMLInputElement).value.trim();
    if (!message) return;
    try {
        showSavingBadge(true);
        await api.addComment(requestId, message, generateRequestId());
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}

async function handleProgramRequestAction(
    requestId: string,
    action: ProgramRequestAction,
): Promise<void> {
    let note = '';
    if (action === 'reject' || action === 'cancel') {
        note = window.prompt('Add a note (required, at least 3 characters):') || '';
        if (note.trim().length < 3) return;
    }
    try {
        showSavingBadge(true);
        await api.performProgramRequestAction(requestId, action, note, generateRequestId());
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}
