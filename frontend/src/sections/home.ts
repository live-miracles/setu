import { namePill, renderEmptyState } from '../ui/components';
import { escapeHtml, formatRosterSchedule } from '../ui/format';
import { INVENTORY_REQUEST_STATUS_BADGE, INVENTORY_REQUEST_STATUS_LABEL } from '../ui/styles';
import { canApprove, canManageConfig } from '../workflows';

interface QueueCard {
    label: string;
    value: number;
    description: string;
    section: 'inventory' | 'programs' | 'tickets';
    status?: string;
    assignee?: string;
}

function todayDisplay(): string {
    return new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function queueCards(dashboard: DashboardPayload): QueueCard[] {
    const summary = dashboard.attentionSummary;
    if (canApprove(dashboard.me)) {
        return [
            {
                label: 'Equipment review',
                value: summary.inventoryAwaitingApproval,
                description: 'Requests waiting for a decision',
                section: 'inventory',
                status: 'submitted',
            },
            {
                label: 'Ready to issue',
                value: summary.inventoryReadyToIssue,
                description: 'Approved equipment to hand over',
                section: 'inventory',
                status: 'approved',
            },
            {
                label: 'Returns overdue',
                value: summary.inventoryOverdue,
                description: 'Issued requests past their end date',
                section: 'inventory',
                status: 'issued',
            },
            {
                label: 'Program review',
                value: summary.programAwaitingApproval,
                description: 'Bookings waiting for a decision',
                section: 'programs',
                status: 'submitted',
            },
            {
                label: 'Open tickets',
                value: summary.openTickets,
                description: 'Unassigned and in-progress support work',
                section: 'tickets',
                status: 'unassigned,pending',
            },
        ];
    }
    if (summary.assignedTickets > 0) {
        return [
            {
                label: 'Assigned to you',
                value: summary.assignedTickets,
                description: 'Support tickets that need your follow-up',
                section: 'tickets',
                assignee: dashboard.me.Email,
            },
        ];
    }
    return [];
}

function renderQueueCard(card: QueueCard): string {
    return `<button type="button" class="attention-card" data-nav-section="${card.section}" ${card.status ? `data-nav-status="${escapeHtml(card.status)}"` : ''} ${card.assignee ? `data-nav-assignee="${escapeHtml(card.assignee)}"` : ''}>
      <span class="ops-kicker">${escapeHtml(card.label)}</span>
      <strong>${card.value}</strong>
      <span>${escapeHtml(card.description)}</span>
      <span class="attention-card-link">Open queue →</span>
    </button>`;
}

export async function renderHome(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const cards = queueCards(dashboard);
    const showRoster = canApprove(dashboard.me);
    const activeRequests = dashboard.inventoryRequests.filter((request) =>
        ['submitted', 'approved', 'issued'].includes(request.Status),
    );

    container.innerHTML = `<section class="home-page space-y-8">
      <header class="home-compact-hero">
        <div>
          <div class="ops-kicker">${escapeHtml(todayDisplay())}</div>
          <h1>${dashboard.attentionSummary.total > 0 ? `${dashboard.attentionSummary.total} actions need attention` : 'Your workspace is up to date'}</h1>
          <p>${canApprove(dashboard.me) ? 'Review operational work and move today’s livestreams forward.' : 'Create requests and track the work visible to your role.'}</p>
        </div>
        <div class="home-primary-actions" aria-label="Create a request">
          <button class="btn btn-primary" data-nav-section="inventory" data-nav-mode="create">Request equipment</button>
          <button class="btn btn-outline" data-nav-section="programs" data-nav-mode="create">Book a program</button>
        </div>
      </header>

      ${
          canManageConfig(dashboard.me) && dashboard.failedEmailCount > 0
              ? `<div class="alert alert-warning"><span>${dashboard.failedEmailCount} notification email(s) failed in the last seven days.</span></div>`
              : ''
      }

      <section aria-labelledby="attention-title">
        <div class="home-panel-header">
          <div><div class="ops-kicker">Action queue</div><h2 id="attention-title" class="home-panel-title mt-2">What needs action</h2></div>
          <span class="text-xs text-base-content/55">Counts respect your role and permissions</span>
        </div>
        ${cards.length ? `<div class="attention-grid">${cards.map(renderQueueCard).join('')}</div>` : `<div class="attention-clear"><strong>No actions are assigned to your role.</strong><span>You can still review your requests below.</span></div>`}
      </section>

      <div class="home-ledger-grid">
        ${
            showRoster
                ? `<section class="home-ledger-section"><div class="home-panel-header"><h2 class="home-panel-title">Upcoming roster</h2><button class="btn btn-ghost btn-sm" data-nav-section="roster">View roster →</button></div>
          ${
              dashboard.upcomingRosters.length
                  ? dashboard.upcomingRosters
                        .slice(0, 5)
                        .map(
                            (roster) =>
                                `<article class="ledger-row"><time class="ledger-time">${escapeHtml(roster.StartTime || 'All day')}</time><div><div class="ledger-title">${escapeHtml(roster.Name)}</div><div class="ledger-meta">${formatRosterSchedule(roster)}</div></div><div class="text-right">${namePill(roster.userName || 'Unassigned')}</div></article>`,
                        )
                        .join('')
                  : renderEmptyState('calendar', 'No upcoming shifts.')
          }</section>`
                : ''
        }

        <section class="home-ledger-section"><div class="home-panel-header"><h2 class="home-panel-title">Equipment requests</h2><button class="btn btn-ghost btn-sm" data-nav-section="inventory">View requests →</button></div>
          ${
              activeRequests.length
                  ? activeRequests
                        .slice(0, 5)
                        .map(
                            (request) =>
                                `<button type="button" class="ledger-row w-full text-left" data-nav-section="inventory" data-nav-request="${escapeHtml(request.Id)}"><span class="ledger-time">REQ-${request.DisplayId}</span><div><div class="ledger-title">${escapeHtml(request.Name)}</div><div class="ledger-meta">${escapeHtml(request.userName)} · ${request.items.map((item) => `${item.Quantity}× ${escapeHtml(item.itemName)}`).join(', ')}</div></div><span class="badge badge-sm ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${INVENTORY_REQUEST_STATUS_LABEL[request.Status]}</span></button>`,
                        )
                        .join('')
                  : renderEmptyState('box', 'No active equipment requests.')
          }
        </section>
      </div>

      <div class="home-notes">
        <section><div class="ops-kicker">Quick links</div><h2 class="home-panel-title mt-3">Team resources</h2><div class="mt-5 space-y-3">${
            dashboard.links.length
                ? dashboard.links
                      .map(
                          (link) =>
                              `<a class="flex items-center justify-between gap-4 border-b border-white/15 pb-2 text-sm" href="${escapeHtml(link.Url)}" target="_blank" rel="noopener"><span>${escapeHtml(link.Name)}</span><span aria-hidden="true">↗</span></a>`,
                      )
                      .join('')
                : '<p class="text-sm opacity-70">No links published.</p>'
        }</div></section>
        <section><div class="ops-kicker">Operations note</div><h2 class="home-panel-title mt-3">Support & guidelines</h2><p class="mt-5 whitespace-pre-wrap text-sm leading-relaxed">${escapeHtml(dashboard.homeContent.Guidelines || 'No guidelines published yet.')}</p>${dashboard.homeContent.WhatsappUrl ? `<a class="btn btn-sm mt-5 border-white/25 bg-transparent text-white" href="${escapeHtml(dashboard.homeContent.WhatsappUrl)}" target="_blank" rel="noopener">WhatsApp support</a>` : ''}</section>
      </div>
    </section>`;
}
