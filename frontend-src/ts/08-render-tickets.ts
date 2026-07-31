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

async function renderTickets(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
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
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="ticket-location">Location</label>
                  <select id="ticket-location" name="locationId" class="select w-full" required>
                    ${dashboard.locations.map((l) => `<option value="${l.Id}">${escapeHtml(l.Name)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="label" for="ticket-priority">Priority</label>
                  <select id="ticket-priority" name="priority" class="select w-full">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </fieldset>
            <button type="submit" class="btn btn-primary">Create ticket</button>
          </form>
        </div>
      </div>

      <div id="ticket-board" class="grid gap-4 md:grid-cols-3"></div>
    </section>
  `;

    wireInternalNavLinks(container);
    wireCreateTicketForm();
    renderTicketBoard(dashboard);
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
                    locationId: String(data.get('locationId')),
                    priority: String(data.get('priority')) as TicketPriority,
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
    const isAdmin = dashboard.me.Role === 'admin';
    const allActions: TicketAction[] = ['assign', 'close', 'reopen'];

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
                  : tickets
                        .map((ticket) => renderTicketCard(ticket, dashboard, isAdmin, allActions))
                        .join('')
          }
        </div>
      </div>`;
    }).join('');

    wireTicketBoard(board);
}

function renderTicketCard(
    ticket: TicketDTO,
    dashboard: DashboardPayload,
    isAdmin: boolean,
    allActions: TicketAction[],
): string {
    const isAssignee = ticket.AssigneeId === dashboard.me.Id;
    const actions = allActions.filter((action) => {
        if (!canTransitionTicket(ticket.Status, action)) return false;
        if (action === 'close') return isAdmin || isAssignee;
        return isAdmin;
    });

    return `
    <article class="card border border-base-300 bg-base-100 shadow-sm" data-ticket-id="${ticket.Id}">
      <div class="card-body gap-2 p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-mono text-xs text-base-content/50">TKT-${ticket.DisplayId}</div>
            <h4 class="truncate font-medium leading-snug">${escapeHtml(ticket.Title)}</h4>
          </div>
          ${
              ticket.assigneeName
                  ? `<span class="badge badge-ghost badge-sm shrink-0">${escapeHtml(ticket.assigneeName)}</span>`
                  : `<span class="badge badge-sm shrink-0 ${TICKET_PRIORITY_BADGE[ticket.Priority]}">${escapeHtml(ticket.Priority)}</span>`
          }
        </div>
        <div class="text-sm text-base-content/60">${escapeHtml(ticket.LocationName)} · reported by ${escapeHtml(ticket.reporterName)}</div>
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
        const users = await api.listUsers();
        const active = users.filter((u) => u.Status === 'active');
        const names = active.map((u, i) => `${i + 1}. ${u.Name} (${u.Email})`).join('\n');
        const choice = window.prompt('Assign to (enter number):\n' + names);
        const index = Number(choice) - 1;
        if (!active[index]) return;
        assigneeId = active[index].Id;
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
