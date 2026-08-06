import { api } from '../api';
import { PROGRAM_REQUEST_QUERY_PARAM, WORKBENCH_MODE_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import {
    navigateToProgram,
    navigateToProgramCreate,
    navigateToProgramEdit,
    navigateToPrograms,
    refreshDashboard,
} from '../router';
import {
    namePill,
    renderCommentLine,
    renderDetailCommandHeader,
    renderEmptyState,
    renderSectionHeader,
} from '../ui/components';
import {
    setButtonPending,
    showErrorAlert,
    showSavingBadge,
    showSuccessToast,
} from '../ui/feedback';
import { openFormDialog } from '../ui/dialog';
import { escapeHtml, formatDateTime } from '../ui/format';
import { icon } from '../ui/icons';
import {
    PROGRAM_REQUEST_ACTION_BTN,
    PROGRAM_REQUEST_STATUS_BADGE,
    PROGRAM_REQUEST_STATUS_LABEL,
} from '../ui/styles';
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
    close: 'Close',
};

const PROGRAM_NEXT_STATUS_LABELS: Record<ProgramRequestStatus, string[]> = {
    draft: ['Submitted', 'Cancelled'],
    submitted: ['Approved', 'Rejected', 'Cancelled'],
    approved: ['Closed', 'Cancelled'],
    rejected: ['Closed'],
    cancelled: ['Closed'],
    closed: [],
};

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
    { id: 'closed', title: 'Closed', description: 'Completed history', statuses: ['closed'] },
];

function toolbarConfig(dashboard: DashboardPayload): WorkbenchToolbarConfig {
    return {
        storageKey: PROGRAM_REQUEST_VIEW_STORAGE_KEY,
        searchPlaceholder: 'Search programs, people, places or sessions',
        statuses: [
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Needs approval' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'closed', label: 'Closed' },
        ],
        filterParam: 'place',
        filterLabel: 'Places',
        filterOptions: dashboard.places.map((place) => ({ value: place.Id, label: place.Name })),
        defaultSort: 'id',
    };
}

export async function renderPrograms(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const programId = params.get(PROGRAM_REQUEST_QUERY_PARAM);
    const mode = params.get(WORKBENCH_MODE_QUERY_PARAM);
    if (mode === 'edit' && programId) {
        try {
            renderProgramCreate(container, dashboard, await api.getProgramRequest(programId));
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('clapper', 'This draft could not be opened.');
        }
        return;
    }
    if (programId) {
        try {
            renderProgramDetail(container, dashboard, await api.getProgramRequest(programId));
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('clapper', 'This program could not be opened.');
        }
        return;
    }
    if (mode === 'create') {
        renderProgramCreate(container, dashboard);
        return;
    }
    renderProgramWorkbench(container, dashboard);
}

function renderProgramWorkbench(container: HTMLElement, dashboard: DashboardPayload): void {
    const config = toolbarConfig(dashboard);
    const state = readWorkbenchState(config);
    container.innerHTML = `
      <section class="space-y-5">
        ${renderSectionHeader(
            'clapper',
            'Programs',
            'Book a place and follow every request through delivery.',
            `<button type="button" id="new-program" class="btn btn-primary btn-sm">${icon('plus', 'size-4')} New program</button>`,
        )}
        ${renderWorkbenchToolbar(config, state)}
        <div id="program-results" aria-live="polite"></div>
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
        placeId: state.filter || undefined,
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
      <div class="workbench-card-top"><span class="font-mono">PRG-${request.DisplayId}</span><span class="badge badge-xs ${PROGRAM_REQUEST_STATUS_BADGE[request.Status]}">${PROGRAM_REQUEST_STATUS_LABEL[request.Status]}</span></div>
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
      <td data-label="Status"><span class="badge badge-sm ${PROGRAM_REQUEST_STATUS_BADGE[request.Status]}">${PROGRAM_REQUEST_STATUS_LABEL[request.Status]}</span></td>
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

function renderProgramCreate(
    container: HTMLElement,
    dashboard: DashboardPayload,
    draft?: ProgramRequestDTO,
): void {
    container.innerHTML = `<section class="space-y-5">
      <div class="detail-heading"><button type="button" id="back-to-programs" class="btn btn-ghost btn-sm">← Back to programs</button><div><p>${draft ? `PRG-${draft.DisplayId} · Draft` : 'New program'}</p><h1>${draft ? 'Edit program request' : 'Request a program'}</h1></div></div>
      <div class="card border border-base-300 bg-base-100"><div class="card-body gap-3">
        <form id="create-program-form" class="space-y-4" data-draft-id="${draft ? escapeHtml(draft.Id) : ''}">
          <fieldset class="fieldset">
            <label class="label" for="program-name">Name</label><input id="program-name" name="name" class="input w-full" value="${escapeHtml(draft?.Name || '')}" placeholder="e.g. Sunday livestream" required />
            <div class="grid gap-3 sm:grid-cols-2"><div><label class="label" for="program-type">Type</label><input id="program-type" name="type" class="input w-full" value="${escapeHtml(draft?.Type || '')}" placeholder="e.g. Livestream" required /></div><div><label class="label" for="program-place">Place</label><select id="program-place" name="placeId" class="select w-full" required>${dashboard.places.map((place) => `<option value="${place.Id}" ${draft?.PlaceId === place.Id ? 'selected' : ''}>${escapeHtml(place.Name)}</option>`).join('')}</select></div></div>
            <label class="label" for="program-participants">Participants</label><input id="program-participants" name="participants" class="input w-full" value="${escapeHtml(draft?.participants.join(', ') || '')}" placeholder="comma-separated emails (optional)" />
            <label class="label">Sessions</label><div id="program-sessions" class="space-y-2"></div>
            <div><button type="button" id="add-program-session" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add session</button></div>
            <div id="program-conflict-feedback" class="hidden alert" role="status" aria-live="polite"></div>
          </fieldset>
          <div class="flex flex-wrap gap-2"><button type="submit" name="intent" value="submitted" class="btn btn-primary">${draft ? 'Save and submit' : 'Submit request'}</button><button type="submit" name="intent" value="draft" class="btn btn-outline">Save draft</button><button type="button" id="cancel-program" class="btn btn-ghost">Cancel</button></div>
        </form>
      </div></div>
    </section>`;
    document.getElementById('back-to-programs')!.addEventListener('click', navigateToPrograms);
    document.getElementById('cancel-program')!.addEventListener('click', navigateToPrograms);
    wireSessionRows(draft?.sessions || []);
    wireCreateProgramForm(draft);
}

function toLocalDateTimeValue(value: string): string {
    return value ? new Date(value).toISOString().slice(0, 16) : '';
}

function wireSessionRows(initialSessions: ProgramSession[] = []): void {
    const list = document.getElementById('program-sessions')!;
    const addButton = document.getElementById('add-program-session')!;
    const addRow = (initial?: ProgramSession) => {
        const row = document.createElement('div');
        row.className =
            'grid gap-2 rounded-box border border-base-200 p-3 sm:grid-cols-2 program-session-row';
        row.innerHTML = `<div><label class="label" for="session-name-${list.children.length}">Session name</label><input id="session-name-${list.children.length}" class="input w-full" name="sessionName" value="${escapeHtml(initial?.Name || '')}" placeholder="Main session" required /></div><div><label class="label" for="session-type-${list.children.length}">Session type</label><div class="flex gap-2"><input id="session-type-${list.children.length}" class="input min-w-0 flex-1" name="sessionType" value="${escapeHtml(initial?.Type || '')}" placeholder="Live, setup, recording…" required /><button type="button" class="btn btn-ghost remove-row" aria-label="Remove session">✕</button></div></div><div><label class="label" for="session-start-${list.children.length}">Start</label><input id="session-start-${list.children.length}" type="datetime-local" class="input w-full" name="startDateTime" value="${toLocalDateTimeValue(initial?.StartDateTime || '')}" required /></div><div><label class="label" for="session-end-${list.children.length}">End</label><input id="session-end-${list.children.length}" type="datetime-local" class="input w-full" name="endDateTime" value="${toLocalDateTimeValue(initial?.EndDateTime || '')}" required /></div>`;
        row.querySelector('.remove-row')!.addEventListener('click', () => row.remove());
        list.appendChild(row);
    };
    addButton.addEventListener('click', () => addRow());
    if (initialSessions.length > 0) initialSessions.forEach(addRow);
    else addRow();
}

function readProgramSessions(form: HTMLFormElement): ProgramSessionInput[] {
    return Array.from(form.querySelectorAll('.program-session-row')).map((row) => {
        const value = (name: string) =>
            (row.querySelector(`[name="${name}"]`) as HTMLInputElement).value;
        return {
            name: value('sessionName'),
            type: value('sessionType'),
            startDateTime: value('startDateTime')
                ? new Date(value('startDateTime')).toISOString()
                : '',
            endDateTime: value('endDateTime') ? new Date(value('endDateTime')).toISOString() : '',
        };
    });
}

function renderProgramConflictFeedback(conflicts: ProgramConflict[]): void {
    const feedback = document.getElementById('program-conflict-feedback');
    if (!feedback) return;
    feedback.classList.remove('hidden', 'alert-success', 'alert-error');
    if (conflicts.length > 0) {
        feedback.classList.add('alert-error');
        feedback.textContent = `${conflicts.length} approved booking conflict${conflicts.length === 1 ? '' : 's'} with this place and time. Resolve the conflict before approval.`;
    } else {
        feedback.classList.add('alert-success');
        feedback.textContent = 'No approved booking conflicts found.';
    }
}

function wireCreateProgramForm(draft?: ProgramRequestDTO): void {
    const form = document.getElementById('create-program-form') as HTMLFormElement;
    let preflightGeneration = 0;
    form.addEventListener('change', () => {
        const generation = ++preflightGeneration;
        const placeId = (form.elements.namedItem('placeId') as HTMLSelectElement).value;
        const sessions = readProgramSessions(form);
        if (
            !placeId ||
            sessions.some((session) => !session.startDateTime || !session.endDateTime)
        ) {
            return;
        }
        void api.checkProgramConflicts(placeId, sessions, draft?.Id).then((conflicts) => {
            if (generation === preflightGeneration) renderProgramConflictFeedback(conflicts);
        });
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
        const initialStatus = submitter?.value === 'draft' ? 'draft' : 'submitted';
        const data = new FormData(form);
        const sessions = readProgramSessions(form);
        try {
            showSavingBadge(true);
            if (submitter) setButtonPending(submitter, true);
            const placeId = String(data.get('placeId'));
            const conflicts = await api.checkProgramConflicts(placeId, sessions, draft?.Id);
            renderProgramConflictFeedback(conflicts);
            const input: CreateProgramRequestInput = {
                name: String(data.get('name')),
                type: String(data.get('type')),
                placeId,
                sessions,
                participants: String(data.get('participants') || ''),
                initialStatus,
            };
            const created = draft
                ? await api.updateProgramRequestDraft(draft.Id, input, generateRequestId())
                : await api.createProgramRequest(input, generateRequestId());
            showSuccessToast(
                initialStatus === 'draft' ? 'Program draft saved.' : 'Program request submitted.',
            );
            navigateToProgram(created.Id);
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
            if (submitter?.isConnected) setButtonPending(submitter, false);
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
    return (['submit', 'approve', 'reject', 'cancel', 'close'] as ProgramRequestAction[]).filter(
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
    const canEditDraft =
        request.Status === 'draft' &&
        (request.UserId === dashboard.me.Email ||
            request.participants.includes(dashboard.me.Email));
    const actionControls = `${canEditDraft ? '<button type="button" id="edit-program-draft" class="btn btn-outline btn-sm">Edit draft</button>' : ''}${renderProgramDetailActions(request.Status, actions)}`;
    container.innerHTML = `<section class="detail-page ${actions.length ? 'detail-page-has-actions' : ''} space-y-5">
      ${renderDetailCommandHeader({
          backButtonId: 'back-to-programs',
          backLabel: 'Back to programs',
          eyebrow: 'Program request',
          reference: `PRG-${request.DisplayId}`,
          title: request.Name,
          statusHtml: `<span class="badge ${PROGRAM_REQUEST_STATUS_BADGE[request.Status]}">${PROGRAM_REQUEST_STATUS_LABEL[request.Status]}</span>`,
          nextStatuses: PROGRAM_NEXT_STATUS_LABELS[request.Status],
          actionsHtml: actionControls,
      })}
      <div class="card border border-base-300 bg-base-100"><div class="card-body gap-5">
        <dl class="detail-grid"><div><dt>Requested by</dt><dd>${escapeHtml(request.userName)}</dd></div><div><dt>Type</dt><dd>${escapeHtml(request.Type)}</dd></div><div><dt>Place</dt><dd>${escapeHtml(request.placeName)}</dd></div><div><dt>Participants</dt><dd class="flex flex-wrap gap-1">${request.participants.length ? request.participants.map(namePill).join('') : 'None'}</dd></div></dl>
      </div></div>
      <div class="card border border-base-300 bg-base-100"><div class="card-body"><h2 class="card-title">Sessions</h2><div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Name</th><th>Type</th><th>Start</th><th>End</th></tr></thead><tbody>${request.sessions.map((session) => `<tr><td>${escapeHtml(session.Name)}</td><td>${escapeHtml(session.Type)}</td><td>${formatDateTime(session.StartDateTime)}</td><td>${formatDateTime(session.EndDateTime)}</td></tr>`).join('')}</tbody></table></div></div></div>
      <div class="card border border-base-300 bg-base-100"><div class="card-body gap-3"><h2 class="card-title">Updates</h2><div class="space-y-2">${request.comments.map(renderCommentLine).join('') || '<p class="text-sm text-base-content/50">No updates yet.</p>'}</div><form id="program-comment-form" class="flex gap-2 border-t border-base-200 pt-3"><input name="message" class="input input-sm flex-1" placeholder="Add a comment" /><button class="btn btn-sm" type="submit">Send</button></form></div></div>
    </section>`;
    document.getElementById('back-to-programs')!.addEventListener('click', navigateToPrograms);
    document
        .getElementById('edit-program-draft')
        ?.addEventListener('click', () => navigateToProgramEdit(request.Id));
    document.querySelectorAll<HTMLButtonElement>('[data-program-action]').forEach((button) =>
        button.addEventListener('click', async () => {
            setButtonPending(button, true);
            try {
                await handleProgramRequestAction(
                    request,
                    button.dataset.programAction as ProgramRequestAction,
                );
            } finally {
                if (button.isConnected) setButtonPending(button, false);
            }
        }),
    );
    document
        .getElementById('program-comment-form')!
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
        approved: 'close',
        rejected: 'close',
        cancelled: 'close',
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
        showSuccessToast('Comment added.');
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}

async function handleProgramRequestAction(
    request: ProgramRequestDTO,
    action: ProgramRequestAction,
): Promise<void> {
    const required = action === 'reject' || action === 'cancel';
    const values = await openFormDialog({
        title: `${PROGRAM_REQUEST_ACTION_LABELS[action]} PRG-${request.DisplayId}?`,
        description: `This will move the request from ${PROGRAM_REQUEST_STATUS_LABEL[request.Status]} to its next lifecycle state. Approval re-checks place and time conflicts.`,
        confirmLabel: PROGRAM_REQUEST_ACTION_LABELS[action],
        tone: required ? 'danger' : 'primary',
        fields:
            required || ['approve', 'close'].includes(action)
                ? [
                      {
                          name: 'note',
                          label: required ? 'Reason' : 'Note (optional)',
                          type: 'textarea',
                          required,
                          minLength: required ? 3 : undefined,
                      },
                  ]
                : [],
    });
    if (!values) return;
    try {
        showSavingBadge(true);
        await api.performProgramRequestAction(
            request.Id,
            action,
            values.note || '',
            generateRequestId(),
        );
        showSuccessToast(`PRG-${request.DisplayId} updated.`);
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}
