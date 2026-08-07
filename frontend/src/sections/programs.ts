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
    renderRequestReadonlyFields,
    renderRequestRecordPanel,
    renderRequesterField,
    renderWorkbenchHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { MONTH_SHORT_NAMES, escapeHtml, formatDateTime } from '../ui/format';
import { icon } from '../ui/icons';
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

type ProgramFieldName =
    'name' | 'language' | 'type' | 'placeId' | 'departmentId' | 'leadEmail' | 'participants';

type SessionFieldName = 'sessionType' | 'startDateTime' | 'endDateTime' | 'sessionName';

const PROGRAM_FIELD_LABELS: Record<ProgramFieldName, string> = {
    name: 'Program title',
    language: 'Language',
    type: 'Program type',
    placeId: 'Place',
    departmentId: 'Department',
    leadEmail: 'Lead email',
    participants: 'Participants',
};

const PROGRAM_FIELD_REQUIRED: Record<ProgramFieldName, (form: HTMLFormElement) => boolean> = {
    name: (form) => String(new FormData(form).get('type') || '') === 'Other',
    language: () => true,
    type: () => true,
    placeId: () => false,
    departmentId: () => true,
    leadEmail: () => true,
    participants: () => false,
};

const SESSION_FIELD_REQUIRED: Record<SessionFieldName, () => boolean> = {
    sessionType: () => true,
    startDateTime: () => true,
    endDateTime: () => true,
    sessionName: () => false,
};

const SESSION_FIELD_LABELS: Record<SessionFieldName, string> = {
    sessionType: 'Session type',
    startDateTime: 'Start',
    endDateTime: 'End',
    sessionName: 'Session title',
};

const PROGRAM_FIELD_NAMES = Object.keys(PROGRAM_FIELD_LABELS) as ProgramFieldName[];

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
        defaultFilter: 'ongoing-future',
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
        .map((column, index) => renderProgramColumn(column, results[index], index, dashboard))
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
                result.items.map((request) => renderProgramBoardCard(request, dashboard)).join(''),
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
    dashboard: DashboardPayload,
): string {
    const content = result.items.length
        ? result.items.map((request) => renderProgramBoardCard(request, dashboard)).join('')
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

function renderProgramBoardCard(request: ProgramRequestDTO, dashboard: DashboardPayload): string {
    const first = request.sessions[0];
    const last = request.sessions[request.sessions.length - 1];
    const department = dashboard.departments.find((item) => item.Id === request.DepartmentId);
    const departmentLabel = department?.ShortName || request.departmentName;
    const meta = [request.userName, departmentLabel, request.placeName]
        .filter(Boolean)
        .map(escapeHtml)
        .join(' | ');
    return `<a class="workbench-card" href="${workItemHref(PROGRAM_REQUEST_QUERY_PARAM, request.Id)}" data-program-id="${request.Id}">
      <h3><span class="font-mono text-xs font-normal text-base-content/55">PRG-${request.DisplayId}</span> ${escapeHtml(programDisplayTitle(request))}</h3>
      ${meta ? `<p>${meta}</p>` : ''}
      ${first ? `<p>${escapeHtml(formatProgramSessionDateRange(first.StartDateTime, last?.EndDateTime || first.StartDateTime))}</p>` : ''}
    </a>`;
}

function formatProgramSessionDateRange(startIso: string, endIso: string): string {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return startIso || endIso || '';

    const startDay = start.getDate();
    const endDay = end.getDate();
    const startMonth = MONTH_SHORT_NAMES[start.getMonth()];
    const endMonth = MONTH_SHORT_NAMES[end.getMonth()];
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (
        startDay === endDay &&
        startMonth === endMonth &&
        startYear === endYear
    ) {
        return `${startDay} ${startMonth}, ${startYear}`;
    }
    if (startMonth === endMonth && startYear === endYear) {
        return `${startDay} - ${endDay} ${startMonth}, ${startYear}`;
    }
    if (startYear === endYear) {
        return `${startDay} ${startMonth} - ${endDay} ${endMonth}, ${startYear}`;
    }
    return `${startDay} ${startMonth}, ${startYear} - ${endDay} ${endMonth}, ${endYear}`;
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
            title: '',
            rows: [
                renderProgramTitleField(),
                renderRequestEditableField(
                    programFieldLabel('language'),
                    renderProgramLanguageSelect(dashboard.programLanguages),
                ),
                renderRequestEditableField(
                    programFieldLabel('type'),
                    renderProgramTypeSelect(dashboard.programTypes),
                ),
                renderRequestEditableField(
                    programFieldLabel('placeId'),
                    `<select id="program-place" name="placeId" class="select select-sm"><option value="">Select place</option>${[
                        ...dashboard.places,
                    ]
                        .sort((a, b) => a.Name.localeCompare(b.Name))
                        .map((place) => `<option value="${place.Id}">${escapeHtml(place.Name)}</option>`)
                        .join('')}</select>`,
                ),
                renderRequesterField({
                    selectId: 'program-user',
                    users,
                    selectedEmail: dashboard.me.Email,
                    requesterName: dashboard.me.Name,
                    editable: true,
                    canEditRequester,
                }),
                renderRequestEditableField(
                    programFieldLabel('departmentId'),
                    renderRequestDepartmentSelect(
                        'program-department',
                        dashboard.departments,
                        dashboard.me.DepartmentId,
                    ),
                ),
                renderRequestEditableField(
                    programFieldLabel('leadEmail'),
                    `<input id="program-lead-email" name="leadEmail" type="email" class="input input-sm" value="${escapeHtml(defaultLeadEmail(dashboard.departments, dashboard.me.DepartmentId))}" required />`,
                ),
                renderRequestEditableField(
                    programFieldLabel('participants'),
                    '<input id="program-participants" name="participants" class="input input-sm" placeholder="email1, email2" />',
                ),
            ],
        },
    ]);
    const sessions = renderProgramSessionsSection(
        'Sessions',
        renderEditableSessionRowsShell(),
        'Reservations should include at least one session before saving.',
        renderAddSessionButton(),
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        `${renderRequestRecordPanel(
            renderRequestRecordTwoPane(fields, sessions),
            'form',
            'id="create-program-form"',
        )}${renderSessionEditModal()}`,
        renderRequestActivityPanel({ createMode: true }),
        false,
    );
    document.getElementById('back-to-programs')!.addEventListener('click', navigateToPrograms);
    document.getElementById('cancel-program')!.addEventListener('click', navigateToPrograms);
    wireDepartmentLeadPrefill(dashboard.departments, 'program-department', 'program-lead-email');
    wireProgramTitleRequirement();
    wireSessionRows(dashboard.sessionTypes);
    wireCreateProgramForm();
}

function wireSessionRows(sessionTypes: SessionType[]): void {
    const list = document.getElementById('program-sessions')!;
    const addButton = document.getElementById('add-program-session')!;
    wireProgramSessionModal(list, sessionTypes);
    addButton.addEventListener('click', () => openProgramSessionModal(list, sessionTypes));
    addProgramSessionRow(list, sessionTypes, defaultProgramSession(list));
}

function addProgramSessionRow(
    list: HTMLElement,
    sessionTypes: SessionType[],
    session?: ProgramSession,
    onChange?: () => void,
): void {
    const row = document.createElement('tr');
    row.className = 'program-session-row';
    setProgramSessionRow(row, session || defaultProgramSession(list), onChange);
    wireProgramSessionRow(row, list, sessionTypes, onChange);
    list.appendChild(row);
    onChange?.();
}

function setProgramSessionRow(row: HTMLElement, session: ProgramSession, onChange?: () => void): void {
    row.innerHTML = `
      <td>${escapeHtml(session.Name || 'Untitled')}<input type="hidden" name="sessionName" value="${escapeHtml(session.Name || '')}" /></td>
      <td>${escapeHtml(session.Type)}<input type="hidden" name="sessionType" value="${escapeHtml(session.Type)}" /></td>
      <td>${escapeHtml(formatDateTime(session.StartDateTime))}<input type="hidden" name="startDateTime" value="${escapeHtml(toDateTimeLocalValue(session.StartDateTime))}" /></td>
      <td>${escapeHtml(formatDateTime(session.EndDateTime))}<input type="hidden" name="endDateTime" value="${escapeHtml(toDateTimeLocalValue(session.EndDateTime))}" /></td>
      <td><span class="program-session-actions"><button type="button" class="btn btn-ghost btn-xs" data-session-edit aria-label="Edit session">${icon('edit', 'size-4')}</button><button type="button" class="btn btn-ghost btn-xs text-error" data-session-delete aria-label="Delete session">${icon('trash', 'size-4')}</button></span></td>`;
}

function wireProgramSessionRow(
    row: HTMLElement,
    list: HTMLElement,
    sessionTypes: SessionType[],
    onChange?: () => void,
): void {
    row.querySelector<HTMLButtonElement>('[data-session-edit]')!.addEventListener('click', () =>
        openProgramSessionModal(list, sessionTypes, row, onChange),
    );
    row.querySelector<HTMLButtonElement>('[data-session-delete]')!.addEventListener('click', () => {
        row.remove();
        onChange?.();
    });
}

function defaultProgramSession(list: HTMLElement): ProgramSession {
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.program-session-row'));
    const last = rows[rows.length - 1];
    if (last) {
        const start = (last.querySelector('[name="startDateTime"]') as HTMLInputElement).value;
        const end = (last.querySelector('[name="endDateTime"]') as HTMLInputElement).value;
        return {
            Name: '',
            Type: '',
            StartDateTime: new Date(start).toISOString(),
            EndDateTime: new Date(end).toISOString(),
        };
    }
    const today = new Date();
    const pad = (part: number) => String(part).padStart(2, '0');
    const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    return {
        Name: '',
        Type: '',
        StartDateTime: new Date(`${date}T13:00`).toISOString(),
        EndDateTime: new Date(`${date}T14:00`).toISOString(),
    };
}

function readSessionFromRow(row: HTMLElement): ProgramSession {
    const value = (name: string) => (row.querySelector(`[name="${name}"]`) as HTMLInputElement).value;
    return {
        Name: value('sessionName'),
        Type: value('sessionType'),
        StartDateTime: value('startDateTime') ? new Date(value('startDateTime')).toISOString() : '',
        EndDateTime: value('endDateTime') ? new Date(value('endDateTime')).toISOString() : '',
    };
}

function wireProgramSessionModal(list: HTMLElement, sessionTypes: SessionType[], onChange?: () => void): void {
    const modal = document.getElementById('program-session-modal') as HTMLDialogElement;
    const form = document.getElementById('program-session-modal-form') as HTMLFormElement;
    const typeSelect = form.elements.namedItem('sessionType') as HTMLSelectElement;
    typeSelect.innerHTML = renderNamedOptionSelect('', 'sessionType', sessionTypes, '')
        .replace(/^<select[^>]*>/, '')
        .replace('</select>', '');
    document.getElementById('cancel-session-modal')!.addEventListener('click', () => modal.close());
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const session = readSessionFromModal(form);
        const error = sessionValidationError(session);
        if (error) {
            showErrorAlert(new Error(error));
            return;
        }
        const index = Number((form.elements.namedItem('rowIndex') as HTMLInputElement).value);
        const rows = Array.from(list.querySelectorAll<HTMLElement>('.program-session-row'));
        const row = rows[index] || document.createElement('tr');
        row.className = 'program-session-row';
        setProgramSessionRow(row, session);
        wireProgramSessionRow(row, list, sessionTypes, onChange);
        if (!rows[index]) list.appendChild(row);
        modal.close();
        onChange?.();
    });
}

function openProgramSessionModal(
    list: HTMLElement,
    sessionTypes: SessionType[],
    row?: HTMLElement,
    onChange?: () => void,
): void {
    void sessionTypes;
    void onChange;
    const modal = document.getElementById('program-session-modal') as HTMLDialogElement;
    const form = document.getElementById('program-session-modal-form') as HTMLFormElement;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.program-session-row'));
    const session = row ? readSessionFromRow(row) : defaultProgramSession(list);
    (form.elements.namedItem('rowIndex') as HTMLInputElement).value = row
        ? String(rows.indexOf(row))
        : '-1';
    (form.elements.namedItem('sessionType') as HTMLSelectElement).value = session.Type;
    (form.elements.namedItem('sessionName') as HTMLInputElement).value = session.Name;
    (form.elements.namedItem('startDateTime') as HTMLInputElement).value = toDateTimeLocalValue(
        session.StartDateTime,
    );
    (form.elements.namedItem('endDateTime') as HTMLInputElement).value = toDateTimeLocalValue(
        session.EndDateTime,
    );
    modal.showModal();
}

function readSessionFromModal(form: HTMLFormElement): ProgramSession {
    const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    return {
        Name: value('sessionName'),
        Type: value('sessionType'),
        StartDateTime: value('startDateTime') ? new Date(value('startDateTime')).toISOString() : '',
        EndDateTime: value('endDateTime') ? new Date(value('endDateTime')).toISOString() : '',
    };
}

function sessionValidationError(session: ProgramSession): string {
    if (!session.Type) return 'Session type is required.';
    if (!session.StartDateTime || !session.EndDateTime) return 'Session start and end are required.';
    const start = Date.parse(session.StartDateTime);
    const end = Date.parse(session.EndDateTime);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return 'Session end must be after start.';
    }
    if (end - start >= 86400000) return 'Sessions must be shorter than 24 hours.';
    return '';
}

function wireCreateProgramForm(): void {
    const form = document.getElementById('create-program-form') as HTMLFormElement;
    wireInvalidFieldStyles(form);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validateProgramForm(form)) return;
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
                    language: String(data.get('language') || ''),
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
        title: programDisplayTitle(request),
        nextStatuses: PROGRAM_NEXT_STATUS_LABELS[request.Status],
        statusSteps: programStatusSteps(request.Status, actions),
        topActionsHtml: editable
            ? '<div id="program-edit-actions" class="hidden"><button type="submit" form="edit-program-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-program-edits" class="btn btn-ghost btn-sm">Cancel</button></div>'
            : '',
    });
    const basicRows = editable
        ? [
              renderProgramTitleField(request.Name),
              renderRequestEditableField(
                  programFieldLabel('language'),
                  renderProgramLanguageSelect(dashboard.programLanguages, request.Language),
              ),
              renderRequestEditableField(
                  programFieldLabel('type'),
                  renderProgramTypeSelect(dashboard.programTypes, request.Type),
              ),
              canEditPlace
                  ? renderRequestEditableField(
                        programFieldLabel('placeId'),
                        renderRequestPlaceSelect(
                            'program-place',
                            dashboard.places,
                            request.PlaceId,
                        ),
                    )
                  : `${renderRequestReadonlyFields([
                        { label: 'Place', valueHtml: escapeHtml(request.placeName || 'None') },
                    ])}<input type="hidden" name="placeId" value="${escapeHtml(request.PlaceId)}" />`,
              renderRequestEditableField(
                  programFieldLabel('departmentId'),
                  renderRequestDepartmentSelect(
                      'program-department',
                      dashboard.departments,
                      request.DepartmentId,
                  ),
              ),
              renderRequestEditableField(
                  programFieldLabel('leadEmail'),
                  `<input id="program-lead-email" name="leadEmail" type="email" class="input input-sm" value="${escapeHtml(request.LeadEmail)}" required />`,
              ),
              renderRequestEditableField(
                  programFieldLabel('participants'),
                  `<input id="program-participants" name="participants" class="input input-sm" value="${escapeHtml(request.participants.join(', '))}" />`,
              ),
          ]
        : [
              renderRequestReadonlyFields([
                  { label: 'Program title', valueHtml: escapeHtml(request.Name || 'None') },
                  { label: 'Language', valueHtml: escapeHtml(request.Language || 'None') },
                  { label: 'Type', valueHtml: escapeHtml(request.Type) },
                  { label: 'Place', valueHtml: escapeHtml(request.placeName || 'None') },
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
            title: '',
            rows: editable
                ? [
                      ...basicRows.slice(0, 4),
                      renderRequesterField({
                          selectId: 'program-user',
                          users,
                          selectedEmail: request.UserId,
                          requesterName: request.userName,
                          editable,
                          canEditRequester,
                      }),
                      ...basicRows.slice(4),
                  ]
                : [
                      ...basicRows,
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
    const sessions = renderProgramSessionsSection(
        'Sessions',
        editable
            ? renderEditableSessionRowsShell()
            : `<div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Title (optional)</th><th>Type</th><th>Start</th><th>End</th></tr></thead><tbody>${request.sessions.map((session) => `<tr><td>${escapeHtml(session.Name)}</td><td>${escapeHtml(session.Type)}</td><td>${formatDateTime(session.StartDateTime)}</td><td>${formatDateTime(session.EndDateTime)}</td></tr>`).join('')}</tbody></table></div>`,
        '',
        editable ? renderAddSessionButton() : '',
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        `${renderRequestRecordPanel(
            renderRequestRecordTwoPane(fields, sessions),
            editable ? 'form' : 'main',
            editable ? 'id="edit-program-form"' : '',
        )}${editable ? renderSessionEditModal() : ''}`,
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
    wireInvalidFieldStyles(form);
    wireDepartmentLeadPrefill(dashboard.departments, 'program-department', 'program-lead-email');
    wireProgramTitleRequirement();
    const list = document.getElementById('program-sessions')!;
    const actions = document.getElementById('program-edit-actions')!;
    const readSnapshot = () => JSON.stringify(readProgramFormInput(form));
    let savedSnapshot = '';
    const updateDirty = () => actions.classList.toggle('hidden', readSnapshot() === savedSnapshot);
    wireProgramSessionModal(list, dashboard.sessionTypes, updateDirty);
    request.sessions.forEach((session) =>
        addProgramSessionRow(list, dashboard.sessionTypes, session, updateDirty),
    );
    savedSnapshot = readSnapshot();
    updateDirty();
    document
        .getElementById('add-program-session')!
        .addEventListener('click', () =>
            openProgramSessionModal(list, dashboard.sessionTypes, undefined, updateDirty),
        );
    form.addEventListener('input', updateDirty);
    form.addEventListener('change', updateDirty);
    document.getElementById('cancel-program-edits')!.addEventListener('click', () => {
        renderProgramDetail(container, dashboard, request, users);
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validateProgramForm(form)) return;
        try {
            showSavingBadge(true);
            const updated = await api.updateProgramRequest(
                request.Id,
                readProgramFormInput(form),
                generateRequestId(),
            );
            savedSnapshot = JSON.stringify({
                name: updated.Name,
                language: updated.Language,
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
        language: String(data.get('language') || ''),
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
    const sortedOptions = [...options].sort((a, b) => a.Name.localeCompare(b.Name));
    return `<select ${id ? `id="${escapeHtml(id)}"` : ''} name="${escapeHtml(name)}" class="select select-sm" required><option value="">Select</option>${hasSelected ? '' : `<option value="${escapeHtml(selectedName)}" selected>${escapeHtml(selectedName)}</option>`}${sortedOptions.map((option) => `<option value="${escapeHtml(option.Name)}" ${option.Name === selectedName ? 'selected' : ''}>${escapeHtml(option.Name)}</option>`).join('')}</select>`;
}

function renderProgramTypeSelect(options: { Name: string }[], selectedName = ''): string {
    const withOther = options.some((option) => option.Name === 'Other')
        ? options
        : [...options, { Name: 'Other' }];
    return renderNamedOptionSelect('program-type', 'type', withOther, selectedName);
}

function renderProgramLanguageSelect(options: { Name: string }[], selectedName = ''): string {
    return renderNamedOptionSelect('program-language', 'language', options, selectedName);
}

function programDisplayTitle(request: ProgramRequestDTO): string {
    return (
        [request.Language, request.Type, request.Name].filter(Boolean).join(' ') ||
        `PRG-${request.DisplayId}`
    );
}

function renderProgramTitleField(value = ''): string {
    return `<label class="request-field"><span id="program-title-label">${renderFieldLabelHtml(PROGRAM_FIELD_LABELS.name, false)}</span><input id="program-name" name="name" class="input input-sm" value="${escapeHtml(value)}" /></label>`;
}

function renderEditableSessionRowsShell(): string {
    return '<div class="overflow-x-auto"><table class="table table-sm program-sessions-table"><thead><tr><th>Title</th><th>Type</th><th>Start</th><th>End</th><th></th></tr></thead><tbody id="program-sessions"></tbody></table></div>';
}

function renderRequestRecordTwoPane(fieldsHtml: string, linesHtml: string): string {
    return `<div class="request-record-two-pane">${fieldsHtml}${linesHtml}</div>`;
}

function renderProgramSessionsSection(
    title: string,
    contentHtml: string,
    notice = '',
    actionsHtml = '',
): string {
    return `<section class="request-lines-panel program-sessions-panel">
      <div class="program-sessions-frame">
        <div class="request-line-header">
          <h2>${escapeHtml(title)}</h2>
          ${actionsHtml ? `<div class="request-line-actions">${actionsHtml}</div>` : ''}
        </div>
        ${contentHtml}
      </div>
      ${notice ? `<div class="request-line-notice">${escapeHtml(notice)}</div>` : ''}
    </section>`;
}

function renderAddSessionButton(): string {
    return `<button type="button" id="add-program-session" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add session</button>`;
}

function renderSessionEditModal(): string {
    return `<dialog id="program-session-modal" class="modal">
      <div class="modal-box w-11/12 max-w-[42rem]">
        <h3 class="mb-4 text-base font-semibold">Session</h3>
        <form id="program-session-modal-form" class="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="rowIndex" />
          <label class="fieldset"><span class="label">${escapeHtml(sessionFieldLabel('sessionType'))}</span><select name="sessionType" class="select w-full" required></select></label>
          <label class="fieldset"><span class="label">${escapeHtml(sessionFieldLabel('sessionName'))}</span><input name="sessionName" class="input w-full" /></label>
          <label class="fieldset"><span class="label">${escapeHtml(sessionFieldLabel('startDateTime'))}</span><input name="startDateTime" type="datetime-local" class="input w-full" required /></label>
          <label class="fieldset"><span class="label">${escapeHtml(sessionFieldLabel('endDateTime'))}</span><input name="endDateTime" type="datetime-local" class="input w-full" required /></label>
          <div class="modal-action sm:col-span-2"><button type="button" class="btn btn-ghost" id="cancel-session-modal">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>`;
}

function renderFieldLabelHtml(label: string, required: boolean): string {
    return required
        ? escapeHtml(label)
        : `${escapeHtml(label)} <span class="request-label-optional">(optional)</span>`;
}

function programFieldLabel(field: ProgramFieldName, form?: HTMLFormElement): string {
    const required = form
        ? PROGRAM_FIELD_REQUIRED[field](form)
        : isAlwaysRequired(PROGRAM_FIELD_REQUIRED[field]);
    return required ? PROGRAM_FIELD_LABELS[field] : PROGRAM_FIELD_LABELS[field] + ' (optional)';
}

function sessionFieldLabel(field: SessionFieldName): string {
    return SESSION_FIELD_REQUIRED[field]()
        ? SESSION_FIELD_LABELS[field]
        : SESSION_FIELD_LABELS[field] + ' (optional)';
}

function isAlwaysRequired(rule: (form: HTMLFormElement) => boolean): boolean {
    if (rule === PROGRAM_FIELD_REQUIRED.name) return false;
    const emptyForm = document.createElement('form');
    return rule(emptyForm);
}

function wireProgramTitleRequirement(): void {
    const form =
        document.getElementById('create-program-form') ||
        document.getElementById('edit-program-form');
    const typeSelect = document.getElementById('program-type') as HTMLSelectElement | null;
    const titleInput = document.getElementById('program-name') as HTMLInputElement | null;
    const titleLabel = document.getElementById('program-title-label');
    if (!(form instanceof HTMLFormElement) || !typeSelect || !titleInput || !titleLabel) return;
    const sync = () => {
        const required = PROGRAM_FIELD_REQUIRED.name(form);
        titleInput.required = required;
        titleLabel.innerHTML = renderFieldLabelHtml(PROGRAM_FIELD_LABELS.name, required);
    };
    typeSelect.addEventListener('change', sync);
    sync();
}

function wireInvalidFieldStyles(form: HTMLFormElement): void {
    form.addEventListener('input', (event) => {
        clearInvalidStyle(event.target);
    });
    form.addEventListener('change', (event) => {
        clearInvalidStyle(event.target);
    });
}

function clearInvalidStyle(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    target.classList.remove('input-error', 'select-error');
    target.setCustomValidity('');
}

function validateProgramForm(form: HTMLFormElement): boolean {
    let sessionError = '';
    PROGRAM_FIELD_NAMES.forEach((field) => {
        const control = form.elements.namedItem(field);
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
        const required = PROGRAM_FIELD_REQUIRED[field](form);
        control.required = required;
        control.setCustomValidity(
            required && !control.value.trim() ? `${PROGRAM_FIELD_LABELS[field]} is required.` : '',
        );
    });
    form.querySelectorAll('.program-session-row').forEach((row) => {
        if (sessionError) return;
        sessionError = sessionValidationError(readSessionFromRow(row as HTMLElement));
    });
    if (!form.querySelector('.program-session-row')) sessionError = 'Add at least one session.';
    if (sessionError) {
        showErrorAlert(new Error(sessionError));
        return false;
    }
    const valid = form.reportValidity();
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        'input:invalid, select:invalid',
    ).forEach((control) => {
        control.classList.add(
            control instanceof HTMLSelectElement ? 'select-error' : 'input-error',
        );
    });
    return valid;
}

function renderRequestPlaceSelect(id: string, places: Place[], selectedId: string): string {
    return `<select id="${id}" name="placeId" class="select select-sm"><option value="">Select place</option>${[
        ...places,
    ]
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map((place) => `<option value="${place.Id}" ${place.Id === selectedId ? 'selected' : ''}>${escapeHtml(place.Name)}</option>`)
        .join('')}</select>`;
}

function renderRequestDepartmentSelect(
    id: string,
    departments: Department[],
    selectedId: string,
): string {
    return `<select id="${id}" name="departmentId" class="select select-sm" required><option value="">Select department</option>${[
        ...departments,
    ]
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map((department) => `<option value="${department.Id}" ${department.Id === selectedId ? 'selected' : ''}>${escapeHtml(department.Name)}</option>`)
        .join('')}</select>`;
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
