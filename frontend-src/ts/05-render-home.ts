async function renderHome(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const activeRequests = dashboard.inventoryRequests.filter(
        (r) => ['submitted', 'approved', 'issued'].indexOf(r.Status) !== -1,
    );

    container.innerHTML = `
    <section class="space-y-6">
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Upcoming shifts</h2>
          ${
              dashboard.upcomingShifts.length === 0
                  ? '<p class="opacity-70">No upcoming shifts.</p>'
                  : `<ul class="divide-y">${dashboard.upcomingShifts
                        .map(
                            (shift) => `
                      <li class="py-2">
                        <div class="font-medium">${escapeHtml(shift.LocationName)} — ${escapeHtml(shift.Period)}</div>
                        <div class="text-sm opacity-70">${formatDateTime(shift.StartsAt)} – ${formatDateTime(shift.EndsAt)}</div>
                        <div class="text-sm">${shift.assignees.map((a) => escapeHtml(a.Name)).join(', ') || 'Unassigned'}</div>
                      </li>`,
                        )
                        .join('')}</ul>`
          }
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Active equipment requests</h2>
          ${
              activeRequests.length === 0
                  ? '<p class="opacity-70">No active requests.</p>'
                  : `<ul class="divide-y">${activeRequests
                        .map(
                            (r) => `
                      <li class="py-2">
                        <div class="font-medium">REQ-${r.DisplayId} — ${escapeHtml(r.Title)}</div>
                        <div class="text-sm opacity-70">${escapeHtml(r.requesterName)} · <span class="badge badge-sm">${escapeHtml(r.Status)}</span></div>
                      </li>`,
                        )
                        .join('')}</ul>`
          }
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Support</h2>
          ${dashboard.homeContent.SupportMessage ? `<p>${escapeHtml(dashboard.homeContent.SupportMessage)}</p>` : ''}
          ${dashboard.homeContent.Guidelines ? `<div class="whitespace-pre-wrap">${escapeHtml(dashboard.homeContent.Guidelines)}</div>` : ''}
          <div class="flex gap-2 flex-wrap mt-2">
            ${dashboard.homeContent.WhatsappUrl ? `<a class="btn btn-sm" href="${escapeHtml(dashboard.homeContent.WhatsappUrl)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
            ${dashboard.homeContent.TutorialUrl ? `<a class="btn btn-sm" href="${escapeHtml(dashboard.homeContent.TutorialUrl)}" target="_blank" rel="noopener">Tutorial</a>` : ''}
            ${dashboard.links.map((l) => `<a class="btn btn-sm btn-ghost" href="${escapeHtml(l.Url)}" target="_blank" rel="noopener">${escapeHtml(l.Name)}</a>`).join('')}
          </div>
        </div>
      </div>
    </section>
  `;
}
