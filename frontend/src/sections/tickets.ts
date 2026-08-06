import { api } from '../api';
import { TICKET_QUERY_PARAM, WORKBENCH_MODE_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import {
    navigateToTicket,
    navigateToTicketCreate,
    navigateToTickets,
    refreshDashboard,
} from '../router';
import {
    renderDetailCommandHeader,
    renderEmptyState,
    renderWorkbenchHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml } from '../ui/format';
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
        defaultSort: 'id',
    };
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
        renderTicketCreate(container);
        return;
    }
    await renderTicketWorkbench(container, dashboard);
}

async function renderTicketWorkbench(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const config = toolbarConfig(dashboard);
    const state = readWorkbenchState(config);
    container.innerHTML = `<section class="workbench-page m-3 h-[calc(100%-1.5rem)]">
      ${renderWorkbenchHeader('Tickets', `<button type="button" id="new-ticket" class="btn btn-primary btn-sm">New</button>`)}
      ${renderWorkbenchToolbar(config, state)}
      <div id="ticket-results" class="min-h-0" aria-live="polite"></div>
    </section>`;
    document.getElementById('new-ticket')!.addEventListener('click', navigateToTicketCreate);
    wireWorkbenchToolbar(config, state, (next) => void loadTicketResults(dashboard, next));
    await loadTicketResults(dashboard, state);
}

function ticketQuery(state: WorkbenchState, statuses?: TicketStatus[]): TicketQuery {
    return {
        q: state.q,
        statuses: state.status ? [state.status as TicketStatus] : statuses,
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
    const columns = TICKET_BOARD_COLUMNS.filter(
        (column) => !state.status || column.status === state.status,
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
      <p>${ticket.assigneeName ? `Assigned to ${escapeHtml(ticket.assigneeName)}` : 'Not assigned'}</p>
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

function renderTicketCreate(container: HTMLElement): void {
    container.innerHTML = `<section class="space-y-5"><div class="detail-heading"><button type="button" id="back-to-tickets" class="btn btn-ghost btn-sm">← Back to tickets</button><div><p>New ticket</p><h1>Report an issue</h1></div></div><div class="card border border-base-300 bg-base-100"><div class="card-body"><form id="create-ticket-form" class="space-y-3"><fieldset class="fieldset"><label class="label" for="ticket-title">Title</label><input id="ticket-title" name="title" class="input w-full" placeholder="Short, searchable title" required /><label class="label" for="ticket-description">Description</label><textarea id="ticket-description" name="description" class="textarea min-h-32 w-full" placeholder="What happened, when, and what have you already tried?"></textarea></fieldset><div class="flex gap-2"><button type="submit" class="btn btn-primary">Create ticket</button><button type="button" id="cancel-ticket" class="btn btn-ghost">Cancel</button></div></form></div></div></section>`;
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
    try {
        showSavingBadge(true);
        const created = await api.createTicket(
            {
                title: String(data.get('title')),
                description: String(data.get('description') || ''),
            },
            generateRequestId(),
        );
        navigateToTicket(created.Id);
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
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
      <div class="card border border-base-300 bg-base-100"><div class="card-body gap-5"><dl class="detail-grid"><div><dt>Assigned to</dt><dd>${ticket.assigneeName ? escapeHtml(ticket.assigneeName) : 'Not assigned'}</dd></div><div class="sm:col-span-2"><dt>Description</dt><dd class="whitespace-pre-wrap">${ticket.Description ? escapeHtml(ticket.Description) : 'No description provided.'}</dd></div></dl></div></div>
    </section>`;
    document.getElementById('back-to-tickets')!.addEventListener('click', navigateToTickets);
    document
        .querySelectorAll<HTMLButtonElement>('[data-ticket-action]')
        .forEach((button) =>
            button.addEventListener(
                'click',
                () =>
                    void handleTicketAction(ticket.Id, button.dataset.ticketAction as TicketAction),
            ),
        );
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

async function handleTicketAction(ticketId: string, action: TicketAction): Promise<void> {
    let assigneeId: string | null = null;
    if (action === 'assign') {
        const users = (await api.listUsers()).filter(canUseTickets);
        const choice = window.prompt(
            'Assign to (enter number):\n' +
                users.map((user, index) => `${index + 1}. ${user.Name} (${user.Email})`).join('\n'),
        );
        const selected = users[Number(choice) - 1];
        if (!selected) return;
        assigneeId = selected.Email;
    }
    try {
        showSavingBadge(true);
        await api.performTicketAction(ticketId, action, assigneeId, generateRequestId());
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}
