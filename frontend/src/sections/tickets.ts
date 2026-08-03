import { api } from '../api';
import { TICKET_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import { navigateToTicket, navigateToTickets, refreshDashboard } from '../router';
import { renderSectionHeader } from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml } from '../ui/format';
import { icon } from '../ui/icons';
import { TICKET_ACTION_BTN } from '../ui/styles';
import { canApprove, canTransitionTicket, canUseTickets } from '../workflows';

const TICKET_ACTION_LABELS: Record<TicketAction, string> = {
    assign: 'Assign',
    close: 'Close',
    reopen: 'Reopen',
};

const TICKET_BOARD_COLUMNS: { status: TicketStatus; title: string }[] = [
    { status: 'unassigned', title: 'Not assigned' },
    { status: 'pending', title: 'Pending' },
    { status: 'closed', title: 'Closed' },
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

export async function renderTickets(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const ticketId = new URLSearchParams(window.location.search).get(TICKET_QUERY_PARAM);
    const selectedTicket = ticketId
        ? dashboard.tickets.find((ticket) => ticket.Id === ticketId)
        : undefined;
    if (selectedTicket) {
        renderTicketDetail(container, dashboard, selectedTicket);
        return;
    }

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('ticket', 'Tickets', 'Track operational issues through resolution.')}

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Report an issue</h2>
          <form id="create-ticket-form" class="space-y-3">
            <fieldset class="fieldset">
              <label class="label" for="ticket-title">Title</label>
              <input id="ticket-title" name="title" class="input w-full" placeholder="Short, searchable title" required />
              <label class="label" for="ticket-description">Description</label>
              <textarea id="ticket-description" name="description" class="textarea w-full" placeholder="What happened, when, and what have you already tried?"></textarea>
            </fieldset>
            <button type="submit" class="btn btn-primary">Create ticket</button>
          </form>
        </div>
      </div>

      <div id="ticket-board" class="grid gap-4 md:grid-cols-3"></div>
    </section>
  `;

    wireCreateTicketForm();
    renderTicketBoard(dashboard);
}

function availableTicketActions(ticket: TicketDTO, dashboard: DashboardPayload): TicketAction[] {
    const isApprover = canApprove(dashboard.me);
    const isAssignee = ticket.AssigneeId === dashboard.me.Email;
    const allActions: TicketAction[] = ['assign', 'close', 'reopen'];
    return allActions.filter((action) => {
        if (!canTransitionTicket(ticket.Status, action)) return false;
        if (action === 'close') return isApprover || isAssignee;
        return isApprover;
    });
}

function renderTicketDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    ticket: TicketDTO,
): void {
    const actions = availableTicketActions(ticket, dashboard);
    container.innerHTML = `
    <section class="space-y-6">
      <div class="flex items-center gap-3">
        <button type="button" id="back-to-tickets" class="btn btn-ghost btn-sm">← Back to tickets</button>
        <div class="min-w-0">
          <p class="text-sm text-base-content/60">Ticket</p>
          <h1 class="truncate text-2xl font-semibold">${escapeHtml(ticket.Title)}</h1>
        </div>
      </div>

      <div id="ticket-detail" data-ticket-id="${ticket.Id}" class="space-y-4">
        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-mono text-sm text-base-content/60">TKT-${ticket.DisplayId}</p>
                <h2 class="card-title text-xl">${escapeHtml(ticket.Title)}</h2>
              </div>
              <span class="badge ${TICKET_STATUS_BADGES[ticket.Status]}">${TICKET_STATUS_LABELS[ticket.Status]}</span>
            </div>
            <dl class="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-base-content/60">Assigned to</dt>
                <dd class="mt-1 font-medium">${ticket.assigneeName ? escapeHtml(ticket.assigneeName) : 'Not assigned'}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-base-content/60">Description</dt>
                <dd class="mt-1 whitespace-pre-wrap text-base-content/80">${ticket.Description ? escapeHtml(ticket.Description) : '<span class="text-base-content/50">No description provided.</span>'}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-3">
            <h2 class="card-title text-base">Actions</h2>
            <div class="ticket-actions flex flex-wrap gap-2">
              ${actions.length > 0 ? actions.map((action) => `<button type="button" class="btn btn-sm ${TICKET_ACTION_BTN[action]}" data-action="${action}">${TICKET_ACTION_LABELS[action]}</button>`).join('') : '<p class="text-sm text-base-content/60">No actions are available for this ticket.</p>'}
            </div>
          </div>
        </div>
      </div>
    </section>`;

    document.getElementById('back-to-tickets')!.addEventListener('click', navigateToTickets);
    document
        .querySelectorAll<HTMLButtonElement>('#ticket-detail button[data-action]')
        .forEach((button) => {
            button.addEventListener('click', async () => {
                await handleTicketAction(ticket.Id, button.dataset.action as TicketAction);
            });
        });
}

function wireCreateTicketForm(): void {
    const form = document.getElementById('create-ticket-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        try {
            showSavingBadge(true);
            await api.createTicket(
                {
                    title: String(data.get('title')),
                    description: String(data.get('description') || ''),
                },
                generateRequestId(),
            );
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function renderTicketBoard(dashboard: DashboardPayload): void {
    const board = document.getElementById('ticket-board');
    if (!board) return;

    board.innerHTML = TICKET_BOARD_COLUMNS.map((column) => {
        const tickets = dashboard.tickets.filter((t) => t.Status === column.status);
        return `
      <div class="space-y-3">
        <div class="flex items-center justify-between px-0.5">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-base-content/60">${column.title}</h3>
          <span class="badge badge-ghost badge-sm">${tickets.length}</span>
        </div>
        <div class="space-y-3">
          ${
              tickets.length === 0
                  ? `<div class="rounded-box border border-dashed border-base-300 py-6 text-center text-sm text-base-content/40">No tickets</div>`
                  : tickets.map((ticket) => renderTicketCard(ticket, dashboard)).join('')
          }
        </div>
      </div>`;
    }).join('');

    wireTicketBoard(board);
}

function renderTicketCard(ticket: TicketDTO, dashboard: DashboardPayload): string {
    const actions = availableTicketActions(ticket, dashboard);

    return `
    <article class="card cursor-pointer border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" data-ticket-id="${ticket.Id}" role="link" tabindex="0" aria-label="Open TKT-${ticket.DisplayId} ${escapeHtml(ticket.Title)}">
      <div class="card-body gap-2 p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-mono text-xs text-base-content/50">TKT-${ticket.DisplayId}</div>
            <h4 class="truncate font-medium leading-snug">${escapeHtml(ticket.Title)}</h4>
          </div>
          ${ticket.assigneeName ? `<span class="badge badge-ghost badge-sm shrink-0">${escapeHtml(ticket.assigneeName)}</span>` : ''}
        </div>
        ${ticket.Description ? `<p class="text-sm text-base-content/70">${escapeHtml(ticket.Description)}</p>` : ''}

        <div class="ticket-actions flex flex-wrap gap-2">
          ${actions.map((action) => `<button type="button" class="btn btn-xs ${TICKET_ACTION_BTN[action]}" data-action="${action}">${TICKET_ACTION_LABELS[action]}</button>`).join('')}
        </div>
      </div>
    </article>`;
}

function wireTicketBoard(board: HTMLElement): void {
    board.querySelectorAll<HTMLElement>('[data-ticket-id]').forEach((card) => {
        const ticketId = card.dataset.ticketId!;

        card.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (target.closest('button, input, select, textarea, label, a')) return;
            navigateToTicket(ticketId);
        });
        card.addEventListener('keydown', (event) => {
            if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            navigateToTicket(ticketId);
        });

        card.querySelectorAll('button[data-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.getAttribute('data-action') as TicketAction;
                await handleTicketAction(ticketId, action);
            });
        });
    });
}

async function handleTicketAction(ticketId: string, action: TicketAction): Promise<void> {
    let assigneeId: string | null = null;
    if (action === 'assign') {
        // Anyone on the `user` role can't open the ticket board at all, so
        // they're not offerable as an assignee — the backend rejects it too.
        const users = (await api.listUsers()).filter(canUseTickets);
        const names = users.map((u, i) => `${i + 1}. ${u.Name} (${u.Email})`).join('\n');
        const choice = window.prompt('Assign to (enter number):\n' + names);
        const index = Number(choice) - 1;
        if (!users[index]) return;
        assigneeId = users[index].Email;
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
