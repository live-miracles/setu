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
    renderRequestActivityPanel,
    renderRequestDetailPage,
    renderRequestEditableField,
    renderRequestFieldGrid,
    renderRequestReadonlyFields,
    renderRequestRecordPanel,
    renderRequestTitleInput,
    renderWorkbenchHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml } from '../ui/format';
import { canApprove, canTransitionTicket, canUseTickets } from '../workflows';
import {
    type WorkbenchState,
    type WorkbenchToolbarConfig,
    readWorkbenchState,
    renderWorkbenchToolbar,
    wireWorkbenchToolbar,
    workItemHref,
} from '../workbench';

const TICKET_VIEW_STORAGE_KEY = 'setu.tickets.requestView';

const TICKET_BOARD_COLUMNS: { status: TicketStatus; title: string; description: string }[] = [
    { status: 'unassigned', title: 'Raised', description: 'Waiting to be picked up' },
    { status: 'pending', title: 'In Progress', description: 'Being worked on' },
    { status: 'closed', title: 'Closed', description: 'Resolved history' },
];

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
    unassigned: 'Raised',
    pending: 'In Progress',
    closed: 'Closed',
};

const TICKET_STATUS_BADGES: Record<TicketStatus, string> = {
    unassigned: 'badge-warning',
    pending: 'badge-info',
    closed: 'badge-success',
};

const TICKET_NEXT_STATUS_LABELS: Record<TicketStatus, string[]> = {
    unassigned: ['In Progress', 'Closed'],
    pending: ['Closed'],
    closed: ['In Progress'],
};

const TICKET_STATUS_STEPS: { status: TicketStatus; label: string }[] = [
    { status: 'unassigned', label: 'Raised' },
    { status: 'pending', label: 'In Progress' },
    { status: 'closed', label: 'Closed' },
];

function ticketStatusSteps(
    status: TicketStatus,
    actions: TicketAction[] = [],
): { label: string; active: boolean; action?: TicketAction }[] {
    return TICKET_STATUS_STEPS.map((step) => ({
        label: step.label,
        active: step.status === status,
        action: ticketActionForStatus(status, step.status, actions),
    }));
}

function ticketActionForStatus(
    currentStatus: TicketStatus,
    targetStatus: TicketStatus,
    actions: TicketAction[],
): TicketAction | undefined {
    if (targetStatus === currentStatus) return undefined;
    if (targetStatus === 'closed' && actions.includes('close')) return 'close';
    if (targetStatus === 'pending' && currentStatus === 'closed' && actions.includes('reopen')) {
        return 'reopen';
    }
    if (targetStatus === 'pending' && actions.includes('assign')) return 'assign';
    return undefined;
}

function toolbarConfig(dashboard: DashboardPayload): WorkbenchToolbarConfig {
    void dashboard;
    return {
        storageKey: TICKET_VIEW_STORAGE_KEY,
        searchPlaceholder: 'Search tickets, descriptions or assignees',
        defaultSort: 'id',
        defaultDirection: 'asc',
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
        statuses,
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
        await renderTicketBoard(host, dashboard, state, generation);
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
    const columns = TICKET_BOARD_COLUMNS;
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
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-tickets',
        backLabel: 'Back to tickets',
        eyebrow: 'Ticket',
        reference: 'New',
        title: 'New ticket',
        nextStatuses: TICKET_NEXT_STATUS_LABELS.unassigned,
        statusSteps: ticketStatusSteps('unassigned'),
        topActionsHtml:
            '<button type="submit" form="create-ticket-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-ticket" class="btn btn-ghost btn-sm">Cancel</button>',
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Issue details',
            rows: [
                renderRequestEditableField(
                    'Description',
                    '<textarea id="ticket-description" name="description" class="textarea textarea-sm min-h-32" placeholder="What happened, when, and what have you already tried?"></textarea>',
                ),
            ],
        },
        {
            title: 'Assignment',
            rows: [
                renderRequestReadonlyFields([{ label: 'Assigned to', valueHtml: 'Not assigned' }]),
            ],
        },
    ]);
    container.innerHTML = renderRequestDetailPage(
        header,
        renderRequestRecordPanel(
            `${renderRequestTitleInput('ticket-title', 'title', 'Ticket title')}${fields}`,
            'form',
            'id="create-ticket-form"',
        ),
        renderRequestActivityPanel({ createMode: true }),
        false,
    );
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
        if (action === 'assign') return canUseTickets(dashboard.me);
        return action === 'close' ? approver || assignee : approver;
    });
}

function renderTicketDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    ticket: TicketDTO,
): void {
    const actions = availableTicketActions(ticket, dashboard);
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-tickets',
        backLabel: 'Back to tickets',
        eyebrow: 'Ticket',
        reference: `TKT-${ticket.DisplayId}`,
        title: ticket.Title,
        nextStatuses: TICKET_NEXT_STATUS_LABELS[ticket.Status],
        statusSteps: ticketStatusSteps(ticket.Status, actions),
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Issue details',
            rows: [
                renderRequestReadonlyFields([
                    {
                        label: 'Description',
                        valueHtml: `<span class="whitespace-pre-wrap">${ticket.Description ? escapeHtml(ticket.Description) : 'No description provided.'}</span>`,
                    },
                ]),
            ],
        },
        {
            title: 'Assignment',
            rows: [
                renderRequestReadonlyFields([
                    {
                        label: 'Assigned to',
                        valueHtml: ticket.assigneeName
                            ? escapeHtml(ticket.assigneeName)
                            : 'Not assigned',
                    },
                ]),
            ],
        },
    ]);
    container.innerHTML = renderRequestDetailPage(
        header,
        renderRequestRecordPanel(fields),
        renderRequestActivityPanel({
            comments: ticket.comments,
            commentFormId: 'ticket-comment-form',
            emptyMessage: 'No ticket activity yet.',
        }),
        false,
    );
    document.getElementById('back-to-tickets')!.addEventListener('click', navigateToTickets);
    document
        .getElementById('ticket-comment-form')!
        .addEventListener('submit', (event) => void submitTicketComment(event, ticket.Id));
    document
        .querySelectorAll<HTMLButtonElement>('[data-detail-action]')
        .forEach((button) =>
            button.addEventListener(
                'click',
                () =>
                    void handleTicketAction(
                        ticket.Id,
                        button.dataset.detailAction as TicketAction,
                        dashboard.me,
                    ),
            ),
        );
}

async function submitTicketComment(event: Event, ticketId: string): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const message = (form.elements.namedItem('message') as HTMLInputElement).value.trim();
    if (!message) return;
    try {
        showSavingBadge(true);
        await api.addComment(ticketId, message, generateRequestId());
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}

async function handleTicketAction(
    ticketId: string,
    action: TicketAction,
    me: UserDTO,
): Promise<void> {
    const targetStatus = action === 'close' ? 'Closed' : 'In Progress';
    if (!window.confirm(`Change this ticket status to ${targetStatus}?`)) {
        return;
    }
    let assigneeId: string | null = null;
    if (action === 'assign') {
        assigneeId = me.Email;
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
