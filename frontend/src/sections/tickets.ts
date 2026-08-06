import { api } from '../api';
import { TICKET_QUERY_PARAM, WORKBENCH_MODE_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import {
    navigateToTicket,
    navigateToTicketCreate,
    navigateToTickets,
    refreshDashboard,
} from '../router';
import { renderDetailCommandHeader, renderEmptyState, renderSectionHeader } from '../ui/components';
import { openFormDialog } from '../ui/dialog';
import {
    setButtonPending,
    showErrorAlert,
    showSavingBadge,
    showSuccessToast,
} from '../ui/feedback';
import { escapeHtml, formatDateTime } from '../ui/format';
import { icon } from '../ui/icons';
import { TICKET_ACTION_BTN } from '../ui/styles';
import { canApprove, canTransitionTicket, canUseTickets } from '../workflows';
import {
    type WorkbenchState,
    type WorkbenchToolbarConfig,
    readWorkbenchState,
    renderWorkbenchToolbar,
    wireSortableHeaders,
    wireWorkbenchToolbar,
    workItemHref,
} from '../workbench';

const TICKET_VIEW_STORAGE_KEY = 'setu.tickets.requestView';

const TICKET_ACTION_LABELS: Record<TicketAction, string> = {
    assign: 'Assign',
    close: 'Close',
    reopen: 'Reopen',
};

const TICKET_BOARD_COLUMNS: { status: TicketStatus; title: string; description: string }[] = [
    { status: 'unassigned', title: 'Not assigned', description: 'Waiting for an owner' },
    { status: 'pending', title: 'Pending', description: 'Being investigated' },
    { status: 'closed', title: 'Closed', description: 'Resolved history' },
];

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
    unassigned: 'Not assigned',
    pending: 'Pending',
    closed: 'Closed',
};

const TICKET_STATUS_BADGES: Record<TicketStatus, string> = {
    unassigned: 'badge-warning',
    pending: 'badge-info',
    closed: 'badge-success',
};

const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
    urgent: 'Urgent',
};

const TICKET_NEXT_STATUS_LABELS: Record<TicketStatus, string[]> = {
    unassigned: ['Assigned / Pending', 'Closed'],
    pending: ['Reassigned / Pending', 'Closed'],
    closed: ['Reopened / Pending'],
};

function toolbarConfig(dashboard: DashboardPayload): WorkbenchToolbarConfig {
    void dashboard;
    return {
        storageKey: TICKET_VIEW_STORAGE_KEY,
        searchPlaceholder: 'Search tickets, descriptions or assignees',
        statuses: TICKET_BOARD_COLUMNS.map((column) => ({
            value: column.status,
            label: column.title,
        })),
        filterParam: 'assignee',
        filterLabel: 'Assignees',
        filterOptions: [{ value: '__unassigned__', label: 'Not assigned' }],
        defaultSort: 'id',
    };
}

async function ticketToolbarConfig(dashboard: DashboardPayload): Promise<WorkbenchToolbarConfig> {
    const users = (await api.listUsers()).filter(canUseTickets);
    const config = toolbarConfig(dashboard);
    config.filterOptions = [
        { value: '__unassigned__', label: 'Not assigned' },
        ...users.map((user) => ({ value: user.Email, label: user.Name })),
    ];
    return config;
}

export async function renderTickets(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get(TICKET_QUERY_PARAM);
    if (ticketId) {
        try {
            renderTicketDetail(container, dashboard, await api.getTicket(ticketId));
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('ticket', 'This ticket could not be opened.');
        }
        return;
    }
    if (params.get(WORKBENCH_MODE_QUERY_PARAM) === 'create') {
        renderTicketCreate(container, dashboard);
        return;
    }
    await renderTicketWorkbench(container, dashboard);
}

async function renderTicketWorkbench(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const config = await ticketToolbarConfig(dashboard);
    const state = readWorkbenchState(config);
    container.innerHTML = `<section class="space-y-5">
      ${renderSectionHeader('ticket', 'Tickets', 'Track operational issues through resolution.', `<button type="button" id="new-ticket" class="btn btn-primary btn-sm">${icon('plus', 'size-4')} New ticket</button>`)}
      ${renderWorkbenchToolbar(config, state)}
      <div id="ticket-results" aria-live="polite"></div>
    </section>`;
    document.getElementById('new-ticket')!.addEventListener('click', navigateToTicketCreate);
    wireWorkbenchToolbar(config, state, (next) => void loadTicketResults(dashboard, next));
    await loadTicketResults(dashboard, state);
}

function ticketQuery(state: WorkbenchState, statuses?: TicketStatus[]): TicketQuery {
    return {
        q: state.q,
        statuses: state.status ? (state.status.split(',') as TicketStatus[]) : statuses,
        assigneeId: state.filter || undefined,
        sortBy: state.sort as TicketQuery['sortBy'],
        sortDirection: state.direction,
    };
}

async function loadTicketResults(
    dashboard: DashboardPayload,
    state: WorkbenchState,
): Promise<void> {
    const generation = ++ticketResultsGeneration;
    const host = document.getElementById('ticket-results');
    if (!host) return;
    host.innerHTML =
        '<div class="workbench-loading"><span class="loading loading-spinner loading-sm"></span> Loading tickets…</div>';
    try {
        if (state.view === 'board') await renderTicketBoard(host, dashboard, state, generation);
        else await renderTicketList(host, dashboard, state, generation);
    } catch (err) {
        if (generation !== ticketResultsGeneration) return;
        host.innerHTML = '<div class="alert alert-error">Tickets could not be loaded.</div>';
        showErrorAlert(err);
    }
}

let ticketResultsGeneration = 0;

async function renderTicketBoard(
    host: HTMLElement,
    dashboard: DashboardPayload,
    state: WorkbenchState,
    generation: number,
): Promise<void> {
    const selectedStatuses = state.status ? state.status.split(',') : [];
    const columns = TICKET_BOARD_COLUMNS.filter(
        (column) => selectedStatuses.length === 0 || selectedStatuses.includes(column.status),
    );
    const results = await Promise.all(
        columns.map((column) => api.listTickets(1, ticketQuery(state, [column.status]))),
    );
    if (generation !== ticketResultsGeneration || !host.isConnected) return;
    host.innerHTML = `<div class="workbench-board">${columns
        .map((column, index) => renderTicketColumn(column, results[index], index))
        .join('')}</div>`;
    wireTicketLinks(host);
    host.querySelectorAll<HTMLButtonElement>('[data-load-ticket-column]').forEach((button) => {
        button.addEventListener('click', async () => {
            const index = Number(button.dataset.loadTicketColumn);
            const page = Number(button.dataset.nextPage);
            const result = await api.listTickets(page, ticketQuery(state, [columns[index].status]));
            button.insertAdjacentHTML('beforebegin', result.items.map(renderTicketCard).join(''));
            wireTicketLinks(button.closest('.workbench-column')!);
            if (page * result.pageSize >= result.totalCount) button.remove();
            else button.dataset.nextPage = String(page + 1);
        });
    });
}

function renderTicketColumn(
    column: (typeof TICKET_BOARD_COLUMNS)[number],
    result: Paginated<TicketDTO>,
    index: number,
): string {
    return `<section class="workbench-column" aria-labelledby="ticket-column-${column.status}">
      <header class="workbench-column-heading"><div><h2 id="ticket-column-${column.status}">${column.title}</h2><p>${column.description}</p></div><span class="badge badge-ghost badge-sm">${result.totalCount}</span></header>
      <div class="workbench-column-items">${result.items.length ? result.items.map(renderTicketCard).join('') : '<div class="workbench-empty-column">No tickets</div>'}</div>
      ${result.items.length < result.totalCount ? `<button type="button" class="btn btn-ghost btn-sm w-full" data-load-ticket-column="${index}" data-next-page="2">Load more</button>` : ''}
    </section>`;
}

function renderTicketCard(ticket: TicketDTO): string {
    return `<a class="workbench-card" href="${workItemHref(TICKET_QUERY_PARAM, ticket.Id)}" data-ticket-id="${ticket.Id}">
      <div class="workbench-card-top"><span class="font-mono">TKT-${ticket.DisplayId}</span><span class="badge badge-xs ${TICKET_STATUS_BADGES[ticket.Status]}">${TICKET_STATUS_LABELS[ticket.Status]}</span></div>
      <h3>${escapeHtml(ticket.Title)}</h3>
      ${ticket.Description ? `<p class="line-clamp-2">${escapeHtml(ticket.Description)}</p>` : ''}
      <p>${ticket.Priority ? `${TICKET_PRIORITY_LABELS[ticket.Priority]} · ` : ''}${ticket.placeName ? `${escapeHtml(ticket.placeName)} · ` : ''}${ticket.assigneeName ? `Assigned to ${escapeHtml(ticket.assigneeName)}` : 'Not assigned'}</p>
    </a>`;
}

async function renderTicketList(
    host: HTMLElement,
    dashboard: DashboardPayload,
    state: WorkbenchState,
    generation: number,
): Promise<void> {
    const result = await api.listTickets(1, ticketQuery(state));
    if (generation !== ticketResultsGeneration || !host.isConnected) return;
    host.innerHTML = `<div class="workbench-table-wrap"><table class="workbench-table"><thead><tr>${sortHeader('Ticket', 'title', state)}<th>Description</th>${sortHeader('Assignee', 'assignee', state)}${sortHeader('Status', 'status', state)}</tr></thead><tbody id="ticket-list-body">${result.items.map(renderTicketRow).join('')}</tbody></table>
      ${result.items.length === 0 ? renderEmptyState('ticket', 'No tickets match these filters.') : ''}
      ${result.items.length < result.totalCount ? `<button type="button" id="load-more-tickets" class="btn btn-ghost btn-sm mt-3">Load more (${result.totalCount - result.items.length})</button>` : ''}</div>`;
    wireTicketLinks(host);
    wireSortableHeaders(state, (next) => void loadTicketResults(dashboard, next));
    document.getElementById('load-more-tickets')?.addEventListener('click', async (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const page = Number(button.dataset.page || '2');
        const next = await api.listTickets(page, ticketQuery(state));
        document
            .getElementById('ticket-list-body')!
            .insertAdjacentHTML('beforeend', next.items.map(renderTicketRow).join(''));
        wireTicketLinks(host);
        if (page * next.pageSize >= next.totalCount) button.remove();
        else button.dataset.page = String(page + 1);
    });
}

function sortHeader(label: string, sort: string, state: WorkbenchState): string {
    const marker = state.sort === sort ? (state.direction === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th><button type="button" data-workbench-sort="${sort}">${label}${marker}</button></th>`;
}

function renderTicketRow(ticket: TicketDTO): string {
    return `<tr><td data-label="Ticket"><a href="${workItemHref(TICKET_QUERY_PARAM, ticket.Id)}" data-ticket-id="${ticket.Id}"><span class="font-mono text-xs">TKT-${ticket.DisplayId}</span><strong>${escapeHtml(ticket.Title)}</strong></a></td><td data-label="Description"><span class="line-clamp-2">${escapeHtml(ticket.Description || 'No description')}</span></td><td data-label="Assignee">${ticket.assigneeName ? escapeHtml(ticket.assigneeName) : 'Not assigned'}</td><td data-label="Status"><span class="badge badge-sm ${TICKET_STATUS_BADGES[ticket.Status]}">${TICKET_STATUS_LABELS[ticket.Status]}</span></td></tr>`;
}

function wireTicketLinks(root: ParentNode): void {
    root.querySelectorAll<HTMLAnchorElement>('a[data-ticket-id]').forEach((link) => {
        if (link.dataset.wired) return;
        link.dataset.wired = 'true';
        link.addEventListener('click', (event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigateToTicket(link.dataset.ticketId!);
        });
    });
}

function renderTicketCreate(container: HTMLElement, dashboard: DashboardPayload): void {
    container.innerHTML = `<section class="space-y-5"><div class="detail-heading"><button type="button" id="back-to-tickets" class="btn btn-ghost btn-sm">← Back to tickets</button><div><p>New ticket</p><h1>Report an issue</h1></div></div><div class="card border border-base-300 bg-base-100"><div class="card-body"><form id="create-ticket-form" class="space-y-4"><fieldset class="fieldset"><label class="label" for="ticket-title">Title</label><input id="ticket-title" name="title" class="input w-full" placeholder="Short, searchable title" required /><div class="grid gap-3 sm:grid-cols-2"><div><label class="label" for="ticket-priority">Priority</label><select id="ticket-priority" name="priority" class="select w-full"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div><label class="label" for="ticket-place">Place</label><select id="ticket-place" name="placeId" class="select w-full"><option value="">No specific place</option>${dashboard.places.map((place) => `<option value="${escapeHtml(place.Id)}">${escapeHtml(place.Name)}</option>`).join('')}</select></div></div><label class="label" for="ticket-description">Description</label><textarea id="ticket-description" name="description" class="textarea min-h-32 w-full" placeholder="What happened, when, and what have you already tried?"></textarea></fieldset><div class="flex gap-2"><button type="submit" class="btn btn-primary">Create ticket</button><button type="button" id="cancel-ticket" class="btn btn-ghost">Cancel</button></div></form></div></div></section>`;
    document.getElementById('back-to-tickets')!.addEventListener('click', navigateToTickets);
    document.getElementById('cancel-ticket')!.addEventListener('click', navigateToTickets);
    document
        .getElementById('create-ticket-form')!
        .addEventListener('submit', (event) => void createTicket(event));
}

async function createTicket(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    try {
        showSavingBadge(true);
        setButtonPending(submit, true);
        const created = await api.createTicket(
            {
                title: String(data.get('title')),
                description: String(data.get('description') || ''),
                priority: String(data.get('priority') || 'normal') as TicketPriority,
                placeId: String(data.get('placeId') || ''),
            },
            generateRequestId(),
        );
        showSuccessToast('Ticket created.');
        navigateToTicket(created.Id);
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
        if (submit.isConnected) setButtonPending(submit, false);
    }
}

function availableTicketActions(ticket: TicketDTO, dashboard: DashboardPayload): TicketAction[] {
    const approver = canApprove(dashboard.me);
    const assignee = ticket.AssigneeId === dashboard.me.Email;
    return (['assign', 'close', 'reopen'] as TicketAction[]).filter((action) => {
        if (!canTransitionTicket(ticket.Status, action)) return false;
        return action === 'close' ? approver || assignee : approver;
    });
}

function renderTicketDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    ticket: TicketDTO,
): void {
    const actions = availableTicketActions(ticket, dashboard);
    const actionControls = renderTicketDetailActions(ticket.Status, actions);
    container.innerHTML = `<section class="detail-page ${actions.length ? 'detail-page-has-actions' : ''} space-y-5">
      ${renderDetailCommandHeader({
          backButtonId: 'back-to-tickets',
          backLabel: 'Back to tickets',
          eyebrow: 'Ticket',
          reference: `TKT-${ticket.DisplayId}`,
          title: ticket.Title,
          statusHtml: `<span class="badge ${TICKET_STATUS_BADGES[ticket.Status]}">${TICKET_STATUS_LABELS[ticket.Status]}</span>`,
          nextStatuses: TICKET_NEXT_STATUS_LABELS[ticket.Status],
          actionsHtml: actionControls,
      })}
      <div class="card border border-base-300 bg-base-100"><div class="card-body gap-5"><dl class="detail-grid"><div><dt>Reported by</dt><dd>${ticket.reporterName ? escapeHtml(ticket.reporterName) : 'Legacy ticket · reporter not recorded'}</dd></div><div><dt>Assigned to</dt><dd>${ticket.assigneeName ? escapeHtml(ticket.assigneeName) : 'Not assigned'}</dd></div><div><dt>Priority</dt><dd>${ticket.Priority ? TICKET_PRIORITY_LABELS[ticket.Priority] : 'Legacy ticket · not recorded'}</dd></div><div><dt>Place</dt><dd>${ticket.placeName ? escapeHtml(ticket.placeName) : 'No place recorded'}</dd></div><div><dt>Created</dt><dd>${ticket.CreatedAt ? formatDateTime(ticket.CreatedAt) : 'Legacy ticket · not recorded'}</dd></div><div><dt>Last updated</dt><dd>${ticket.UpdatedAt ? formatDateTime(ticket.UpdatedAt) : 'Legacy ticket · not recorded'}</dd></div><div class="sm:col-span-2"><dt>Description</dt><dd class="whitespace-pre-wrap">${ticket.Description ? escapeHtml(ticket.Description) : 'No description provided.'}</dd></div></dl></div></div>
      <div class="card border border-base-300 bg-base-100"><div class="card-body gap-3"><div class="flex items-baseline justify-between gap-3"><h2 class="card-title">Activity</h2><span class="text-sm text-base-content/55">${ticket.comments.length}</span></div><div class="space-y-3">${ticket.comments.length ? ticket.comments.map((comment) => `<article class="border-l-2 border-base-300 pl-3"><div class="flex flex-wrap items-baseline gap-2"><strong>${escapeHtml(comment.userName)}</strong><time class="text-xs text-base-content/50">${formatDateTime(comment.Timestamp)}</time></div><p class="mt-1 text-sm text-base-content/75">${escapeHtml(comment.Message)}</p></article>`).join('') : '<p class="text-sm text-base-content/55">No activity recorded.</p>'}</div><form id="ticket-comment-form" class="flex gap-2 border-t border-base-200 pt-3"><label class="sr-only" for="ticket-comment">Add a comment</label><input id="ticket-comment" name="message" class="input input-sm min-w-0 flex-1" placeholder="Add a comment" required /><button type="submit" class="btn btn-sm">Send</button></form></div></div>
    </section>`;
    document.getElementById('back-to-tickets')!.addEventListener('click', navigateToTickets);
    document.querySelectorAll<HTMLButtonElement>('[data-ticket-action]').forEach((button) =>
        button.addEventListener('click', async () => {
            setButtonPending(button, true);
            try {
                await handleTicketAction(ticket, button.dataset.ticketAction as TicketAction);
            } finally {
                if (button.isConnected) setButtonPending(button, false);
            }
        }),
    );
    document.getElementById('ticket-comment-form')!.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const input = form.elements.namedItem('message') as HTMLInputElement;
        const message = input.value.trim();
        if (!message) return;
        const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        try {
            setButtonPending(button, true);
            await api.addTicketComment(ticket.Id, message, generateRequestId());
            showSuccessToast('Comment added.');
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            if (button.isConnected) setButtonPending(button, false);
        }
    });
}

function renderTicketDetailActions(status: TicketStatus, actions: TicketAction[]): string {
    if (actions.length === 0) return '';
    const primaryAction: TicketAction = status === 'closed' ? 'reopen' : 'assign';
    const overflow: TicketAction[] =
        actions.length > 1 ? actions.filter((action) => action === 'close') : [];
    const visible = actions
        .filter((action) => !overflow.includes(action))
        .sort((a, b) => Number(b === primaryAction) - Number(a === primaryAction));
    return `${visible
        .map(
            (action) =>
                `<button type="button" class="btn btn-sm ${action === primaryAction ? 'btn-primary' : TICKET_ACTION_BTN[action]}" data-ticket-action="${action}">${TICKET_ACTION_LABELS[action]}</button>`,
        )
        .join('')}${renderTicketActionMenu(overflow)}`;
}

function renderTicketActionMenu(actions: TicketAction[]): string {
    if (actions.length === 0) return '';
    return `<details class="dropdown dropdown-end"><summary class="btn btn-ghost btn-sm">More</summary><ul class="menu dropdown-content w-40 rounded-box p-2">${actions.map((action) => `<li><button type="button" data-ticket-action="${action}">${TICKET_ACTION_LABELS[action]}</button></li>`).join('')}</ul></details>`;
}

async function handleTicketAction(ticket: TicketDTO, action: TicketAction): Promise<void> {
    let assigneeId: string | null = null;
    if (action === 'assign') {
        const users = (await api.listUsers()).filter(canUseTickets);
        const values = await openFormDialog({
            title: `Assign TKT-${ticket.DisplayId}`,
            description: 'Choose a team member who can access the ticket board.',
            confirmLabel: 'Assign ticket',
            fields: [
                {
                    name: 'assigneeId',
                    label: 'Assignee',
                    type: 'select',
                    value: ticket.AssigneeId,
                    required: true,
                    options: users.map((user) => ({ value: user.Email, label: user.Name })),
                },
            ],
        });
        if (!values) return;
        assigneeId = values.assigneeId;
    } else {
        const values = await openFormDialog({
            title: `${TICKET_ACTION_LABELS[action]} TKT-${ticket.DisplayId}?`,
            description:
                action === 'close'
                    ? 'Close this issue after the resolution has been verified.'
                    : 'Reopen this ticket and return it to active work.',
            confirmLabel: TICKET_ACTION_LABELS[action],
            tone: action === 'close' ? 'danger' : 'primary',
        });
        if (!values) return;
    }
    try {
        showSavingBadge(true);
        await api.performTicketAction(ticket.Id, action, assigneeId, generateRequestId());
        showSuccessToast(`TKT-${ticket.DisplayId} updated.`);
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}
