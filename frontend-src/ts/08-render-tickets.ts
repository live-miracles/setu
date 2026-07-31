const TICKET_ACTION_LABELS: Record<TicketAction, string> = {
    assign: 'Assign',
    close: 'Close',
    reopen: 'Reopen',
};

async function renderTickets(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    container.innerHTML = `
    <section class="space-y-6">
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title">Report an issue</h2>
          <form id="create-ticket-form" class="space-y-2">
            <input name="title" class="input input-bordered w-full" placeholder="Title" required />
            <textarea name="description" class="textarea textarea-bordered w-full" placeholder="Description"></textarea>
            <select name="locationId" class="select select-bordered w-full" required>
              ${dashboard.locations.map((l) => `<option value="${l.Id}">${escapeHtml(l.Name)}</option>`).join('')}
            </select>
            <select name="priority" class="select select-bordered w-full">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
            <button type="submit" class="btn btn-primary">Create ticket</button>
          </form>
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Tickets</h2>
          <ul id="ticket-list" class="divide-y"></ul>
        </div>
      </div>
    </section>
  `;

    wireCreateTicketForm();
    renderTicketList(dashboard);
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

function renderTicketList(dashboard: DashboardPayload): void {
    const list = document.getElementById('ticket-list');
    if (!list) return;
    const isAdmin = dashboard.me.Role === 'admin';
    const allActions: TicketAction[] = ['assign', 'close', 'reopen'];

    list.innerHTML =
        dashboard.tickets.length === 0
            ? '<li class="py-2 opacity-70">No tickets yet.</li>'
            : dashboard.tickets
                  .map((ticket) => {
                      const isAssignee = ticket.AssigneeId === dashboard.me.Id;
                      const actions = allActions.filter((action) => {
                          if (!canTransitionTicket(ticket.Status, action)) return false;
                          if (action === 'close') return isAdmin || isAssignee;
                          return isAdmin;
                      });
                      return `
              <li class="py-3" data-ticket-id="${ticket.Id}">
                <div class="flex justify-between items-start gap-2">
                  <div>
                    <div class="font-medium">TKT-${ticket.DisplayId} — ${escapeHtml(ticket.Title)}</div>
                    <div class="text-sm opacity-70">${escapeHtml(ticket.LocationName)} · ${escapeHtml(ticket.Priority)} · reported by ${escapeHtml(ticket.reporterName)}</div>
                    ${ticket.assigneeName ? `<div class="text-sm">Assigned to ${escapeHtml(ticket.assigneeName)}</div>` : ''}
                  </div>
                  <span class="badge shrink-0">${escapeHtml(ticket.Status)}</span>
                </div>
                <div class="mt-2 space-y-1 comment-list">
                  ${ticket.comments.map((c) => `<div class="text-sm"><span class="font-medium">${escapeHtml(c.authorName)}:</span> ${escapeHtml(c.Message)}</div>`).join('')}
                </div>
                <form class="mt-2 flex gap-2 comment-form">
                  <input class="input input-bordered input-sm flex-1" placeholder="Add a comment" name="message" />
                  <button type="submit" class="btn btn-sm">Comment</button>
                </form>
                <div class="flex gap-2 mt-2 flex-wrap ticket-actions">
                  ${actions.map((action) => `<button type="button" class="btn btn-xs" data-action="${action}">${TICKET_ACTION_LABELS[action]}</button>`).join('')}
                </div>
              </li>`;
                  })
                  .join('');

    list.querySelectorAll('li[data-ticket-id]').forEach((li) => {
        const ticketId = (li as HTMLElement).dataset.ticketId!;

        li.querySelectorAll('button[data-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.getAttribute('data-action') as TicketAction;
                await handleTicketAction(ticketId, action);
            });
        });

        const commentForm = li.querySelector('.comment-form') as HTMLFormElement;
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = commentForm.querySelector('input[name="message"]') as HTMLInputElement;
            const message = input.value.trim();
            if (!message) return;
            try {
                showSavingBadge(true);
                await api.addTicketComment(ticketId, message, generateRequestId());
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            } finally {
                showSavingBadge(false);
            }
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
