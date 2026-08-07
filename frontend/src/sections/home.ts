import { namePill, renderEmptyState } from '../ui/components';
import { escapeHtml, formatRosterSchedule } from '../ui/format';
import { INVENTORY_REQUEST_STATUS_BADGE } from '../ui/styles';
import { canApprove, canManageConfig, canUseTickets, isRequestOverdue } from '../workflows';

function todayDateOnly(): string {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

function todayDisplayParts(): { day: string; weekday: string; monthYear: string } {
    const now = new Date();
    return {
        day: String(now.getDate()).padStart(2, '0'),
        weekday: now.toLocaleDateString(undefined, { weekday: 'long' }),
        monthYear: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
}

function rosterTimeLabel(roster: RosterDTO): string {
    const start = roster.StartTime || 'All day';
    const end = roster.EndTime ? `–${roster.EndTime}` : '';
    return `${start}${end}`;
}

export async function renderHome(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const showRoster = canApprove(dashboard.me);
    const showTickets = canUseTickets(dashboard.me);
    const date = todayDisplayParts();
    const today = todayDateOnly();

    const todayRosters = dashboard.upcomingRosters.filter(
        (roster) => roster.StartDate <= today && roster.EndDate >= today,
    );
    const activeRequests = dashboard.inventoryRequests.filter(
        (request) => ['submitted', 'approved', 'issued'].indexOf(request.Status) !== -1,
    );
    const awaitingApproval = activeRequests.filter(
        (request) => request.Status === 'submitted',
    ).length;
    const overdueRequests = activeRequests.filter(isRequestOverdue).length;

    const activePrograms = dashboard.programRequests.filter(
        (request) => ['submitted', 'approved'].indexOf(request.Status) !== -1,
    );
    const programsAwaitingApproval = activePrograms.filter(
        (request) => request.Status === 'submitted',
    ).length;
    const openTickets = dashboard.tickets.filter((ticket) => ticket.Status !== 'closed');
    const lowStockItems = dashboard.inventoryTypes.filter(
        (type) => type.TotalQuantity > 0 && type.availableQuantity / type.TotalQuantity <= 0.3,
    );

    const nextRoster = [...dashboard.upcomingRosters].sort((a, b) =>
        (a.StartDate + a.StartTime).localeCompare(b.StartDate + b.StartTime),
    )[0];

    const attentionCount =
        awaitingApproval +
        programsAwaitingApproval +
        overdueRequests +
        lowStockItems.length +
        (showTickets ? openTickets.length : 0);
    const headline =
        attentionCount > 0
            ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention.`
            : 'Today’s operations are clear.';
    const operationalSummary = [
        showRoster
            ? `${todayRosters.length} shift${todayRosters.length === 1 ? '' : 's'} today`
            : '',
        `${activeRequests.length} active equipment request${activeRequests.length === 1 ? '' : 's'}`,
        `${activePrograms.length} active program request${activePrograms.length === 1 ? '' : 's'}`,
    ]
        .filter(Boolean)
        .join(' · ');

    container.innerHTML = `
    <section class="home-page space-y-10">
      <header class="home-signature">
        <div class="home-signature-date">
          <div class="home-date-kicker">${escapeHtml(date.weekday)} · ${escapeHtml(date.monthYear)}</div>
          <div class="home-signature-day" aria-hidden="true">${date.day}</div>
        </div>
        <div class="home-signature-copy">
          <h1>${escapeHtml(headline)}</h1>
          <p class="home-summary">${escapeHtml(operationalSummary)}</p>
        </div>
      </header>

      <div class="home-content-wrap space-y-10">
      ${
          canManageConfig(dashboard.me) && dashboard.failedEmailCount > 0
              ? `<div class="alert alert-warning">
              <span class="font-mono text-xs">NOTICE</span>
              <span>${dashboard.failedEmailCount} notification email(s) failed to send in the last 7 days.</span>
            </div>`
              : ''
      }

      <div class="home-command-grid">
        <section class="home-actions">
          <div class="ops-kicker">In service today</div>
          <h2 class="mt-3">Support today’s livestreams</h2>
          <p class="mt-3 max-w-xl text-sm text-base-content/60">
            ${
                dashboard.homeContent.SupportMessage
                    ? escapeHtml(dashboard.homeContent.SupportMessage)
                    : 'Create a request, reserve a place or review the working roster.'
            }
          </p>
          <div class="mt-6 flex flex-wrap gap-2">
            <button class="btn btn-primary btn-sm" data-nav-section="inventory">Request equipment</button>
            <button class="btn btn-outline btn-sm" data-nav-section="programs">Book a program</button>
            ${showRoster ? '<button class="btn btn-ghost btn-sm" data-nav-section="roster">Open roster →</button>' : ''}
          </div>
        </section>

        ${
            showRoster
                ? `<aside class="home-next-shift">
          <div class="ops-kicker">Next shift</div>
          ${
              nextRoster
                  ? `<h3>${escapeHtml(nextRoster.Name)}</h3>
              <p class="mt-3 text-sm text-base-content/60">${formatRosterSchedule(nextRoster)}</p>
              <div class="mt-4">${nextRoster.UserId ? namePill(nextRoster.userName) : '<span class="badge badge-warning badge-sm">Unassigned</span>'}</div>`
                  : '<p class="mt-4 text-sm text-base-content/50">No shifts scheduled yet.</p>'
          }
        </aside>`
                : ''
        }
      </div>

      <section>
        <div class="mb-4 flex items-end justify-between gap-4">
          <div>
            <div class="ops-kicker">Work queue</div>
            <h2 class="home-panel-title mt-2">Needs a decision</h2>
          </div>
          <span class="text-xs text-base-content/50">Live from the current workspace</span>
        </div>
        <div class="work-queue">
          <div class="work-queue-item" data-priority="${awaitingApproval > 0 ? 'high' : 'normal'}">
            <span class="ops-kicker">Equipment</span>
            <strong class="work-queue-value">${awaitingApproval}</strong>
            <span class="work-queue-label">awaiting approval</span>
          </div>
          <div class="work-queue-item" data-priority="${programsAwaitingApproval > 0 ? 'high' : 'normal'}">
            <span class="ops-kicker">Programs</span>
            <strong class="work-queue-value">${programsAwaitingApproval}</strong>
            <span class="work-queue-label">awaiting approval</span>
          </div>
          <div class="work-queue-item" data-priority="${overdueRequests > 0 ? 'high' : 'normal'}">
            <span class="ops-kicker">Returns</span>
            <strong class="work-queue-value">${overdueRequests}</strong>
            <span class="work-queue-label">overdue requests</span>
          </div>
          <div class="work-queue-item" data-priority="${showTickets && openTickets.length > 0 ? 'high' : 'normal'}">
            <span class="ops-kicker">${showTickets ? 'Tickets' : 'Inventory'}</span>
            <strong class="work-queue-value">${showTickets ? openTickets.length : lowStockItems.length}</strong>
            <span class="work-queue-label">${showTickets ? 'open tickets' : 'low-stock items'}</span>
          </div>
        </div>
      </section>

      <div class="home-ledger-grid">
        ${
            showRoster
                ? `<section class="home-ledger-section">
          <div class="home-panel-header">
            <h2 class="home-panel-title">Upcoming roster</h2>
            <button class="btn btn-ghost btn-xs" data-nav-section="roster">View all →</button>
          </div>
          ${
              dashboard.upcomingRosters.length === 0
                  ? renderEmptyState('calendar', 'No upcoming shifts.')
                  : `<div>${dashboard.upcomingRosters
                        .slice(0, 5)
                        .map(
                            (roster) => `<article class="ledger-row">
                  <time class="ledger-time">${escapeHtml(rosterTimeLabel(roster))}</time>
                  <div>
                    <div class="ledger-title">${escapeHtml(roster.Name)}</div>
                    <div class="ledger-meta">${formatRosterSchedule(roster)}</div>
                  </div>
                  <div class="text-right text-xs text-base-content/60">${roster.userName ? escapeHtml(roster.userName) : 'Unassigned'}</div>
                </article>`,
                        )
                        .join('')}</div>`
          }
        </section>`
                : ''
        }

        <section class="home-ledger-section">
          <div class="home-panel-header">
            <h2 class="home-panel-title">Equipment requests</h2>
            <button class="btn btn-ghost btn-xs" data-nav-section="inventory">View all →</button>
          </div>
          ${
              activeRequests.length === 0
                  ? renderEmptyState('box', 'No active requests.')
                  : `<div>${activeRequests
                        .slice(0, 5)
                        .map(
                            (request) => `<article class="ledger-row">
                  <span class="ledger-time">REQ-${request.DisplayId}</span>
                  <div>
                    <div class="ledger-title">${escapeHtml(request.Name)}</div>
                    <div class="ledger-meta">${escapeHtml(request.userName)} · ${request.items.map((item) => `${item.Quantity}× ${escapeHtml(item.itemName)}`).join(', ')}</div>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    ${isRequestOverdue(request) ? '<span class="badge badge-error badge-sm">Overdue</span>' : ''}
                    <span class="badge badge-sm ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span>
                  </div>
                </article>`,
                        )
                        .join('')}</div>`
          }
        </section>
      </div>

      <div class="home-notes">
        <section>
          <div class="ops-kicker">Shortcuts</div>
          <h2 class="home-panel-title mt-3">Quick links</h2>
          ${
              dashboard.links.length === 0
                  ? '<p class="mt-5 text-sm">No links added yet.</p>'
                  : `<div class="mt-5 space-y-3">${dashboard.links
                        .map(
                            (
                                link,
                            ) => `<a class="flex items-center justify-between gap-4 border-b border-white/15 pb-2 text-sm" href="${escapeHtml(link.Url)}" target="_blank" rel="noopener">
                    <span>${escapeHtml(link.Name)}</span><span aria-hidden="true">↗</span>
                  </a>`,
                        )
                        .join('')}</div>`
          }
        </section>
        <section>
          <div class="ops-kicker">Working note</div>
          <h2 class="home-panel-title mt-3">Support & guidelines</h2>
          <p class="mt-5 whitespace-pre-wrap text-sm leading-relaxed">${
              dashboard.homeContent.Guidelines
                  ? escapeHtml(dashboard.homeContent.Guidelines)
                  : 'No guidelines published yet.'
          }</p>
          <div class="mt-5 flex flex-wrap gap-2">
            ${dashboard.homeContent.WhatsappUrl ? `<a class="btn btn-sm border-white/25 bg-transparent text-white hover:bg-white/10" href="${escapeHtml(dashboard.homeContent.WhatsappUrl)}" target="_blank" rel="noopener">WhatsApp support</a>` : ''}
            ${dashboard.homeContent.TutorialUrl ? `<a class="btn btn-ghost btn-sm text-white" href="${escapeHtml(dashboard.homeContent.TutorialUrl)}" target="_blank" rel="noopener">Booking tutorial</a>` : ''}
          </div>
        </section>
      </div>
      </div>
    </section>
  `;
}
