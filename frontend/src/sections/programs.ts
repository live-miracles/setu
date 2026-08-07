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
    renderRequestEditableField,
    renderRequestFieldGrid,
    renderRequestLineSection,
    renderRequestReadonlyFields,
    renderRequestRecordPanel,
    renderRequesterField,
    renderRequestTitleInput,
    renderWorkbenchHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml, formatDateTime } from '../ui/format';
import { icon } from '../ui/icons';
import { PROGRAM_REQUEST_STATUS_BADGE } from '../ui/styles';
import { canApprove, canTransitionProgramRequest } from '../workflows';
import {
    type WorkbenchState,
    type WorkbenchToolbarConfig,
    readWorkbenchState,
    renderWorkbenchToolbar,
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

function programStatusSteps(
    status: ProgramRequestStatus,
    actions: ProgramRequestAction[] = [],
): { label: string; active: boolean; action?: ProgramRequestAction }[] {
    const targetActions: Partial<Record<ProgramRequestStatus, ProgramRequestAction>> = {
        submitted: 'submit',
        approved: 'approve',
        rejected: 'reject',
        cancelled: 'cancel',
    };
    return PROGRAM_STATUS_STEPS.map((step) => ({
        label: step.label,
        active: step.status === status,
        action: actions.includes(targetActions[step.status]!)
            ? targetActions[step.status]
            : undefined,
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
        filterParam: 'period',
        filterLabel: 'Programs',
        filterOptions: [
            { value: 'ongoing-future', label: 'Ongoing & Future' },
            { value: 'past', label: 'Past' },
        ],
        defaultSort: 'sessionStart',
        defaultDirection: 'asc',
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
            const request = await api.getProgramRequest(programId);
            const users = canApprove(dashboard.me) ? await api.listUsers() : [];
            renderProgramDetail(container, dashboard, request, users);
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('clapper', 'This program could not be opened.');
        }
        return;
    }
    if (params.get(WORKBENCH_MODE_QUERY_PARAM) === 'create') {
        const users = canApprove(dashboard.me) ? await api.listUsers() : [];
        renderProgramCreate(container, dashboard, users);
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
        statuses,
        dateScope: state.filter as ProgramRequestQuery['dateScope'],
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
        await renderProgramBoard(host, dashboard, state, generation);
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
    const columns = PROGRAM_BOARD_COLUMNS;
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
    users: UserDTO[] = [],
): void {
    const canEditRequester = canApprove(dashboard.me);
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-programs',
        backLabel: 'Back to programs',
        eyebrow: 'Program request',
        reference: 'New',
        title: 'New program request',
        nextStatuses: PROGRAM_NEXT_STATUS_LABELS.draft,
        statusSteps: programStatusSteps('draft'),
        topActionsHtml:
            '<button type="submit" form="create-program-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-program" class="btn btn-ghost btn-sm">Cancel</button>',
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: [
                renderRequestEditableField(
                    'Program type',
                    renderNamedOptionSelect('program-type', 'type', dashboard.programTypes),
                ),
                renderRequestEditableField(
                    'Place',
                    `<select id="program-place" name="placeId" class="select select-sm" required><option value="">Select place</option>${dashboard.places.map((place) => `<option value="${place.Id}">${escapeHtml(place.Name)}</option>`).join('')}</select>`,
                ),
                renderRequestEditableField(
                    'Department',
                    renderRequestDepartmentSelect(
                        'program-department',
                        dashboard.departments,
                        dashboard.me.DepartmentId,
                    ),
                ),
                renderRequestEditableField(
                    'Lead email',
                    `<input id="program-lead-email" name="leadEmail" type="email" class="input input-sm" value="${escapeHtml(defaultLeadEmail(dashboard.departments, dashboard.me.DepartmentId))}" required />`,
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
                renderRequesterField({
                    selectId: 'program-user',
                    users,
                    selectedEmail: dashboard.me.Email,
                    requesterName: dashboard.me.Name,
                    editable: true,
                    canEditRequester,
                }),
            ],
        },
    ]);
    const sessions = renderRequestLineSection(
        'Sessions',
        `<div class="program-session-heading"><span>Session type</span><span>Start</span><span>End</span><span>Session title</span><span></span></div><div id="program-sessions" class="request-line-list"></div><button type="button" id="add-program-session" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add session</button>`,
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
        false,
    );
    document.getElementById('back-to-programs')!.addEventListener('click', navigateToPrograms);
    document.getElementById('cancel-program')!.addEventListener('click', navigateToPrograms);
    wireDepartmentLeadPrefill(dashboard.departments, 'program-department', 'program-lead-email');
    wireSessionRows(dashboard.sessionTypes);
    wireCreateProgramForm();
}

function wireSessionRows(sessionTypes: SessionType[]): void {
    const list = document.getElementById('program-sessions')!;
    const addButton = document.getElementById('add-program-session')!;
    const addRow = () => addProgramSessionRow(list, sessionTypes);
    addButton.addEventListener('click', addRow);
    addRow();
}

function addProgramSessionRow(
    list: HTMLElement,
    sessionTypes: SessionType[],
    session?: ProgramSession,
    onChange?: () => void,
): void {
    const row = document.createElement('div');
    row.className = 'program-session-row';
    row.innerHTML = `${renderNamedOptionSelect('', 'sessionType', sessionTypes, session?.Type || '')}<input type="datetime-local" class="input input-sm" name="startDateTime" value="${escapeHtml(toDateTimeLocalValue(session?.StartDateTime || ''))}" required /><input type="datetime-local" class="input input-sm" name="endDateTime" value="${escapeHtml(toDateTimeLocalValue(session?.EndDateTime || ''))}" required /><input class="input input-sm" name="sessionName" placeholder="Session title" value="${escapeHtml(session?.Name || '')}" required /><button type="button" class="btn btn-ghost btn-sm remove-row" aria-label="Remove session">✕</button>`;
    row.querySelector('.remove-row')!.addEventListener('click', () => {
        row.remove();
        onChange?.();
    });
    row.querySelectorAll('input, select').forEach((control) => {
        control.addEventListener('input', () => onChange?.());
        control.addEventListener('change', () => onChange?.());
    });
    list.appendChild(row);
    onChange?.();
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
                    userId: String(data.get('userId')),
                    placeId: String(data.get('placeId')),
                    sessions,
                    departmentId: String(data.get('departmentId')),
                    leadEmail: String(data.get('leadEmail')),
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
    users: UserDTO[] = [],
): void {
    const actions = availableProgramActions(request, dashboard);
    const editable = canEditProgramRequest(request, dashboard);
    const canEditPlace = canApprove(dashboard.me);
    const canEditRequester = canApprove(dashboard.me);
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-programs',
        backLabel: 'Back to programs',
        eyebrow: 'Program request',
        reference: `PRG-${request.DisplayId}`,
        title: request.Name,
        nextStatuses: PROGRAM_NEXT_STATUS_LABELS[request.Status],
        statusSteps: programStatusSteps(request.Status, actions),
        topActionsHtml: editable
            ? '<div id="program-edit-actions" class="hidden"><button type="submit" form="edit-program-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-program-edits" class="btn btn-ghost btn-sm">Cancel</button></div>'
            : '',
    });
    const basicRows = editable
        ? [
              renderRequestEditableField(
                  'Program type',
                  renderNamedOptionSelect(
                      'program-type',
                      'type',
                      dashboard.programTypes,
                      request.Type,
                  ),
              ),
              canEditPlace
                  ? renderRequestEditableField(
                        'Place',
                        renderRequestPlaceSelect(
                            'program-place',
                            dashboard.places,
                            request.PlaceId,
                        ),
                    )
                  : `${renderRequestReadonlyFields([
                        { label: 'Place', valueHtml: escapeHtml(request.placeName) },
                    ])}<input type="hidden" name="placeId" value="${escapeHtml(request.PlaceId)}" />`,
              renderRequestEditableField(
                  'Department',
                  renderRequestDepartmentSelect(
                      'program-department',
                      dashboard.departments,
                      request.DepartmentId,
                  ),
              ),
              renderRequestEditableField(
                  'Lead email',
                  `<input id="program-lead-email" name="leadEmail" type="email" class="input input-sm" value="${escapeHtml(request.LeadEmail)}" required />`,
              ),
              renderRequestEditableField(
                  'Participants',
                  `<input id="program-participants" name="participants" class="input input-sm" value="${escapeHtml(request.participants.join(', '))}" />`,
              ),
          ]
        : [
              renderRequestReadonlyFields([
                  { label: 'Type', valueHtml: escapeHtml(request.Type) },
                  { label: 'Place', valueHtml: escapeHtml(request.placeName) },
                  { label: 'Department', valueHtml: escapeHtml(request.departmentName) },
                  { label: 'Lead email', valueHtml: escapeHtml(request.LeadEmail) },
                  {
                      label: 'Participants',
                      valueHtml: request.participants.length
                          ? request.participants.map(namePill).join('')
                          : 'None',
                  },
              ]),
          ];
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: basicRows,
        },
        {
            title: 'Requester info',
            rows: [
                renderRequesterField({
                    selectId: 'program-user',
                    users,
                    selectedEmail: request.UserId,
                    requesterName: request.userName,
                    editable,
                    canEditRequester,
                }),
            ],
        },
    ]);
    const sessions = renderRequestLineSection(
        'Sessions',
        editable
            ? `<div class="program-session-heading"><span>Session type</span><span>Start</span><span>End</span><span>Session title</span><span></span></div><div id="program-sessions" class="request-line-list"></div><button type="button" id="add-program-session" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add session</button>`
            : `<div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Name</th><th>Type</th><th>Start</th><th>End</th></tr></thead><tbody>${request.sessions.map((session) => `<tr><td>${escapeHtml(session.Name)}</td><td>${escapeHtml(session.Type)}</td><td>${formatDateTime(session.StartDateTime)}</td><td>${formatDateTime(session.EndDateTime)}</td></tr>`).join('')}</tbody></table></div>`,
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        renderRequestRecordPanel(
            `${editable ? renderRequestTitleInput('program-name', 'name', 'Program title') : ''}${fields}${sessions}`,
            editable ? 'form' : 'main',
            editable ? 'id="edit-program-form"' : '',
        ),
        renderRequestActivityPanel({
            comments: request.comments,
            commentFormId: 'request-comment-form',
        }),
        false,
    );
    document.getElementById('back-to-programs')!.addEventListener('click', navigateToPrograms);
    if (editable) wireProgramDetailEditForm(container, dashboard, request, users);
    document
        .querySelectorAll<HTMLButtonElement>('[data-detail-action]')
        .forEach((button) =>
            button.addEventListener(
                'click',
                () =>
                    void handleProgramRequestAction(
                        request.Id,
                        button.dataset.detailAction as ProgramRequestAction,
                    ),
            ),
        );
    document
        .getElementById('request-comment-form')!
        .addEventListener('submit', (event) => void submitProgramComment(event, request.Id));
}

function canEditProgramRequest(request: ProgramRequestDTO, dashboard: DashboardPayload): boolean {
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    if (['rejected', 'cancelled'].includes(request.Status)) return false;
    return canApprove(dashboard.me) || (owner && request.Status === 'draft');
}

function wireProgramDetailEditForm(
    container: HTMLElement,
    dashboard: DashboardPayload,
    request: ProgramRequestDTO,
    users: UserDTO[] = [],
): void {
    const form = document.getElementById('edit-program-form') as HTMLFormElement;
    const title = document.getElementById('program-name') as HTMLInputElement;
    title.value = request.Name;
    wireDepartmentLeadPrefill(dashboard.departments, 'program-department', 'program-lead-email');
    const list = document.getElementById('program-sessions')!;
    const actions = document.getElementById('program-edit-actions')!;
    const readSnapshot = () => JSON.stringify(readProgramFormInput(form));
    let savedSnapshot = '';
    const updateDirty = () => actions.classList.toggle('hidden', readSnapshot() === savedSnapshot);
    request.sessions.forEach((session) =>
        addProgramSessionRow(list, dashboard.sessionTypes, session, updateDirty),
    );
    savedSnapshot = readSnapshot();
    updateDirty();
    document
        .getElementById('add-program-session')!
        .addEventListener('click', () =>
            addProgramSessionRow(list, dashboard.sessionTypes, undefined, updateDirty),
        );
    form.addEventListener('input', updateDirty);
    form.addEventListener('change', updateDirty);
    document.getElementById('cancel-program-edits')!.addEventListener('click', () => {
        renderProgramDetail(container, dashboard, request, users);
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            showSavingBadge(true);
            const updated = await api.updateProgramRequest(
                request.Id,
                readProgramFormInput(form),
                generateRequestId(),
            );
            savedSnapshot = JSON.stringify({
                name: updated.Name,
                type: updated.Type,
                userId: updated.UserId,
                placeId: updated.PlaceId,
                sessions: updated.sessions.map((session) => ({
                    name: session.Name,
                    type: session.Type,
                    startDateTime: session.StartDateTime,
                    endDateTime: session.EndDateTime,
                })),
                departmentId: updated.DepartmentId,
                leadEmail: updated.LeadEmail,
                participants: updated.participants.join(', '),
            });
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function readProgramFormInput(form: HTMLFormElement): UpdateProgramRequestInput {
    const data = new FormData(form);
    return {
        name: String(data.get('name')),
        type: String(data.get('type')),
        userId: String(data.get('userId')),
        placeId: String(data.get('placeId')),
        sessions: Array.from(form.querySelectorAll('.program-session-row')).map((row) => {
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
        }),
        departmentId: String(data.get('departmentId')),
        leadEmail: String(data.get('leadEmail')),
        participants: String(data.get('participants') || ''),
    };
}

function renderNamedOptionSelect(
    id: string,
    name: string,
    options: { Name: string }[],
    selectedName = '',
): string {
    const hasSelected = !selectedName || options.some((option) => option.Name === selectedName);
    return `<select ${id ? `id="${escapeHtml(id)}"` : ''} name="${escapeHtml(name)}" class="select select-sm" required><option value="">Select</option>${hasSelected ? '' : `<option value="${escapeHtml(selectedName)}" selected>${escapeHtml(selectedName)}</option>`}${options.map((option) => `<option value="${escapeHtml(option.Name)}" ${option.Name === selectedName ? 'selected' : ''}>${escapeHtml(option.Name)}</option>`).join('')}</select>`;
}

function renderRequestPlaceSelect(id: string, places: Place[], selectedId: string): string {
    return `<select id="${id}" name="placeId" class="select select-sm" required><option value="">Select place</option>${places.map((place) => `<option value="${place.Id}" ${place.Id === selectedId ? 'selected' : ''}>${escapeHtml(place.Name)}</option>`).join('')}</select>`;
}

function renderRequestDepartmentSelect(
    id: string,
    departments: Department[],
    selectedId: string,
): string {
    return `<select id="${id}" name="departmentId" class="select select-sm" required><option value="">Select department</option>${departments.map((department) => `<option value="${department.Id}" ${department.Id === selectedId ? 'selected' : ''}>${escapeHtml(department.Name)}</option>`).join('')}</select>`;
}

function defaultLeadEmail(departments: Department[], departmentId: string): string {
    return departments.find((department) => department.Id === departmentId)?.LeadEmail || '';
}

function wireDepartmentLeadPrefill(
    departments: Department[],
    departmentSelectId: string,
    leadEmailId: string,
): void {
    const departmentSelect = document.getElementById(
        departmentSelectId,
    ) as HTMLSelectElement | null;
    const leadEmail = document.getElementById(leadEmailId) as HTMLInputElement | null;
    if (!departmentSelect || !leadEmail) return;
    departmentSelect.addEventListener('change', () => {
        leadEmail.value = defaultLeadEmail(departments, departmentSelect.value);
        leadEmail.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function toDateTimeLocalValue(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    if (
        !window.confirm(
            `Change this program request status: ${PROGRAM_REQUEST_ACTION_LABELS[action]}?`,
        )
    ) {
        return;
    }
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
