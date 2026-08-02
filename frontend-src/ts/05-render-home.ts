function greetingForNow(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function todayDateOnly(): string {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

async function renderHome(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    // Home summarises every section, so it drops the cards, stats and jump
    // links for the two sections a role may not open at all — otherwise it
    // would advertise a roster or ticket board that isn't there. The
    // payload is empty for those anyway (see getDashboard).
    const showRoster = canApprove(dashboard.me);
    const showTickets = canUseTickets(dashboard.me);

    const today = todayDateOnly();
    const todayRosters = dashboard.upcomingRosters.filter(
        (r) => r.StartDate <= today && r.EndDate >= today,
    );
    const todayAssignments = todayRosters.filter((r) => r.UserId).length;

    const activeRequests = dashboard.inventoryRequests.filter(
        (r) => ['submitted', 'approved', 'issued'].indexOf(r.Status) !== -1,
    );
    const awaitingApproval = activeRequests.filter((r) => r.Status === 'submitted').length;

    const activePrograms = dashboard.programRequests.filter(
        (r) => ['submitted', 'approved'].indexOf(r.Status) !== -1,
    );
    const programsAwaitingApproval = activePrograms.filter((r) => r.Status === 'submitted').length;

    const openTickets = dashboard.tickets.filter((t) => t.Status !== 'closed');

    const lowStockItems = dashboard.inventoryTypes.filter(
        (t) => t.TotalQuantity > 0 && t.availableQuantity / t.TotalQuantity <= 0.3,
    );

    const nextRoster = [...dashboard.upcomingRosters].sort((a, b) =>
        (a.StartDate + a.StartTime).localeCompare(b.StartDate + b.StartTime),
    )[0];

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('home', greetingForNow(), "Here's today's operations pulse.")}

      ${
          canManageConfig(dashboard.me) && dashboard.failedEmailCount > 0
              ? `<div class="alert alert-warning">
              ${icon('alert', 'size-5')}
              <span>${dashboard.failedEmailCount} notification email(s) failed to send in the last 7 days.</span>
            </div>`
              : ''
      }

      <div class="grid gap-4 ${showRoster ? 'lg:grid-cols-[1.3fr_1fr]' : ''}">
        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-3">
            <span class="text-xs font-semibold uppercase tracking-wide text-base-content/50">Welcome back</span>
            ${
                dashboard.homeContent.SupportMessage
                    ? `<p class="text-sm text-base-content/70">${escapeHtml(dashboard.homeContent.SupportMessage)}</p>`
                    : `<p class="text-sm text-base-content/50">Everything ready for the next broadcast.</p>`
            }
            <div class="mt-1 flex flex-wrap gap-2">
              <button class="btn btn-sm btn-primary" data-nav-section="inventory">
                ${icon('box', 'size-4')}
                Request equipment
              </button>
              <button class="btn btn-sm btn-primary" data-nav-section="programs">
                ${icon('clapper', 'size-4')}
                Book a program
              </button>
              ${
                  showRoster
                      ? `<button class="btn btn-outline btn-sm" data-nav-section="roster">
                ${icon('calendar', 'size-4')}
                View roster
              </button>`
                      : ''
              }
            </div>
          </div>
        </div>

        ${
            showRoster
                ? `<div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-base-content/50">Next shift</span>
            ${
                nextRoster
                    ? `
              <h3 class="text-lg font-bold">${escapeHtml(nextRoster.Name)}</h3>
              <p class="text-sm text-base-content/60">${formatRosterSchedule(nextRoster)}</p>
              <div class="mt-1.5 flex flex-wrap gap-1">
                ${nextRoster.UserId ? namePill(nextRoster.userName) : '<span class="text-sm text-base-content/50">Unassigned</span>'}
              </div>`
                    : `<p class="text-sm text-base-content/50">No shifts scheduled yet.</p>`
            }
          </div>
        </div>`
                : ''
        }
      </div>

      <div class="stats stats-vertical w-full border border-base-300 bg-base-100 shadow sm:stats-horizontal">
        ${
            showRoster
                ? `<div class="stat">
          <div class="stat-figure text-primary">${icon('calendar', 'size-6')}</div>
          <div class="stat-title">Today's shifts</div>
          <div class="stat-value text-2xl">${todayRosters.length}</div>
          <div class="stat-desc">${todayAssignments} crew assignment${todayAssignments === 1 ? '' : 's'}</div>
        </div>`
                : ''
        }
        <div class="stat">
          <div class="stat-figure text-warning">${icon('box', 'size-6')}</div>
          <div class="stat-title">Active requests</div>
          <div class="stat-value text-2xl">${activeRequests.length}</div>
          <div class="stat-desc">${awaitingApproval} awaiting approval</div>
        </div>
        <div class="stat">
          <div class="stat-figure text-secondary">${icon('clapper', 'size-6')}</div>
          <div class="stat-title">Program requests</div>
          <div class="stat-value text-2xl">${activePrograms.length}</div>
          <div class="stat-desc">${programsAwaitingApproval} awaiting approval</div>
        </div>
        ${
            showTickets
                ? `<div class="stat">
          <div class="stat-figure text-info">${icon('ticket', 'size-6')}</div>
          <div class="stat-title">Open tickets</div>
          <div class="stat-value text-2xl">${openTickets.length}</div>
        </div>`
                : ''
        }
        <div class="stat">
          <div class="stat-figure text-error">${icon('alert', 'size-6')}</div>
          <div class="stat-title">Low stock</div>
          <div class="stat-value text-2xl">${lowStockItems.length}</div>
          <div class="stat-desc">Below 30% availability</div>
        </div>
      </div>

      <div class="grid gap-4 ${showRoster ? 'md:grid-cols-2' : ''}">
        ${
            showRoster
                ? `<div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-2">
            <div class="flex items-center justify-between">
              <h2 class="card-title text-base">${icon('calendar', 'size-5 text-primary')} Upcoming roster</h2>
              <button class="btn btn-ghost btn-xs" data-nav-section="roster">View all</button>
            </div>
            ${
                dashboard.upcomingRosters.length === 0
                    ? renderEmptyState('calendar', 'No upcoming shifts.')
                    : `<ul class="divide-y divide-base-200">${dashboard.upcomingRosters
                          .slice(0, 4)
                          .map(
                              (roster) => `
                      <li class="flex items-start justify-between gap-3 py-2.5">
                        <div class="min-w-0">
                          <div class="truncate font-medium">${escapeHtml(roster.Name)}</div>
                          <div class="text-sm text-base-content/60">${formatRosterSchedule(roster)}</div>
                          <div class="mt-1 text-sm text-base-content/70">${roster.userName ? escapeHtml(roster.userName) : 'Unassigned'}</div>
                        </div>
                      </li>`,
                          )
                          .join('')}</ul>`
            }
          </div>
        </div>`
                : ''
        }

        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-2">
            <div class="flex items-center justify-between">
              <h2 class="card-title text-base">${icon('box', 'size-5 text-primary')} Equipment requests</h2>
              <button class="btn btn-ghost btn-xs" data-nav-section="inventory">View all</button>
            </div>
            ${
                activeRequests.length === 0
                    ? renderEmptyState('box', 'No active requests.')
                    : `<ul class="divide-y divide-base-200">${activeRequests
                          .slice(0, 4)
                          .map(
                              (r) => `
                      <li class="border-l-2 ${INVENTORY_REQUEST_STATUS_ACCENT[r.Status]} py-2.5 pl-3">
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0">
                            <div class="truncate font-medium">${escapeHtml(r.Name)}</div>
                            <div class="text-sm text-base-content/60">${escapeHtml(r.userName)} · ${r.items.map((i) => `${i.Quantity}× ${escapeHtml(i.itemName)}`).join(', ')}</div>
                          </div>
                          <div class="flex shrink-0 flex-col items-end gap-1">
                            ${isRequestOverdue(r) ? '<span class="badge badge-error badge-sm">Overdue</span>' : ''}
                            <span class="badge badge-sm ${INVENTORY_REQUEST_STATUS_BADGE[r.Status]}">${escapeHtml(r.Status)}</span>
                          </div>
                        </div>
                      </li>`,
                          )
                          .join('')}</ul>`
            }
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-2">
            <h2 class="card-title text-base">${icon('external', 'size-5 text-primary')} Quick links</h2>
            ${
                dashboard.links.length === 0
                    ? '<p class="text-sm text-base-content/50">No links added yet.</p>'
                    : `<div class="space-y-1">${dashboard.links
                          .map(
                              (l) => `
                      <a class="flex items-center gap-2 rounded-box px-2 py-1.5 text-sm hover:bg-base-200" href="${escapeHtml(l.Url)}" target="_blank" rel="noopener">
                        ${icon('external', 'size-4 text-base-content/50')}
                        ${escapeHtml(l.Name)}
                      </a>`,
                          )
                          .join('')}</div>`
            }
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-2">
            <h2 class="card-title text-base">${icon('shield', 'size-5 text-primary')} Support & guidelines</h2>
            ${dashboard.homeContent.Guidelines ? `<p class="whitespace-pre-wrap text-sm text-base-content/70">${escapeHtml(dashboard.homeContent.Guidelines)}</p>` : '<p class="text-sm text-base-content/50">No guidelines published yet.</p>'}
            <div class="mt-1 flex flex-wrap gap-2">
              ${dashboard.homeContent.WhatsappUrl ? `<a class="btn btn-sm" href="${escapeHtml(dashboard.homeContent.WhatsappUrl)}" target="_blank" rel="noopener">WhatsApp support</a>` : ''}
              ${dashboard.homeContent.TutorialUrl ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(dashboard.homeContent.TutorialUrl)}" target="_blank" rel="noopener">Booking tutorial</a>` : ''}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

    wireInternalNavLinks(container);
}
