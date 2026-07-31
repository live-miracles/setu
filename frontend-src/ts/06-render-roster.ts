function formatDayTile(iso: string): { day: string; month: string } {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { day: '--', month: '' };
    return {
        day: d.toLocaleDateString(undefined, { day: '2-digit' }),
        month: d.toLocaleDateString(undefined, { month: 'short' }),
    };
}

async function renderRoster(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const isAdmin = dashboard.me.Role === 'admin';
    const users = isAdmin ? await api.listUsers() : [];

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('calendar', 'Roster', 'Plan shifts and keep the team aligned.')}
      ${isAdmin ? renderCreateShiftForm(dashboard, users) : ''}
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title text-base">Shifts</h2>
          <ul id="roster-list" class="divide-y divide-base-200"></ul>
        </div>
      </div>
    </section>
  `;

    wireInternalNavLinks(container);
    renderRosterList(dashboard.upcomingShifts);
    if (isAdmin) wireCreateShiftForm();
}

function renderCreateShiftForm(dashboard: DashboardPayload, users: ProfileDTO[]): string {
    const activeUsers = users.filter((u) => u.Status === 'active');
    return `
    <form id="create-shift-form" class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body gap-3">
        <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Schedule a shift</h2>
        <fieldset class="fieldset">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label" for="shift-starts-at">Starts</label>
              <input id="shift-starts-at" name="startsAt" type="datetime-local" class="input w-full" required />
            </div>
            <div>
              <label class="label" for="shift-ends-at">Ends</label>
              <input id="shift-ends-at" name="endsAt" type="datetime-local" class="input w-full" required />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label" for="shift-period">Period</label>
              <select id="shift-period" name="period" class="select w-full" required>
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
              </select>
            </div>
            <div>
              <label class="label" for="shift-location">Location</label>
              <select id="shift-location" name="locationId" class="select w-full" required>
                ${dashboard.locations.map((l) => `<option value="${l.Id}">${escapeHtml(l.Name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <label class="label" for="shift-assignees">Assignees</label>
          <select id="shift-assignees" name="assigneeProfileIds" class="h-32 w-full rounded-field border border-base-content/20 bg-base-100 p-1.5" multiple>
            ${activeUsers.map((u) => `<option value="${u.Id}">${escapeHtml(u.Name)} (${escapeHtml(u.Email)})</option>`).join('')}
          </select>
          <label class="label" for="shift-notes">Notes</label>
          <textarea id="shift-notes" name="notes" class="textarea w-full" placeholder="Handover notes for this shift"></textarea>
        </fieldset>
        <div>
          <button type="submit" class="btn btn-primary">Create shift</button>
        </div>
      </div>
    </form>
  `;
}

function wireCreateShiftForm(): void {
    const form = document.getElementById('create-shift-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const assigneeSelect = form.querySelector(
            'select[name="assigneeProfileIds"]',
        ) as HTMLSelectElement;
        const assigneeProfileIds = Array.from(assigneeSelect.selectedOptions).map((o) => o.value);

        try {
            showSavingBadge(true);
            await api.createRosterShift(
                {
                    startsAt: new Date(String(data.get('startsAt'))).toISOString(),
                    endsAt: new Date(String(data.get('endsAt'))).toISOString(),
                    period: String(data.get('period')) as ShiftPeriod,
                    locationId: String(data.get('locationId')),
                    notes: String(data.get('notes') || ''),
                    assigneeProfileIds,
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

function renderRosterList(shifts: RosterShiftDTO[]): void {
    const list = document.getElementById('roster-list');
    if (!list) return;
    list.innerHTML =
        shifts.length === 0
            ? `<li class="py-2">${renderEmptyState('calendar', 'No shifts scheduled.')}</li>`
            : shifts
                  .map((shift) => {
                      const tile = formatDayTile(shift.StartsAt);
                      return `
              <li class="flex items-start gap-4 py-3">
                <div class="flex w-14 shrink-0 flex-col items-center justify-center rounded-box bg-base-200 py-1.5">
                  <span class="text-lg font-bold leading-none">${tile.day}</span>
                  <span class="text-xs uppercase text-base-content/60">${tile.month}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium">${escapeHtml(shift.Period)}</span>
                    <span class="text-sm text-base-content/60">${formatTimeRange(shift.StartsAt, shift.EndsAt)}</span>
                  </div>
                  <div class="text-sm text-base-content/60">${escapeHtml(shift.LocationName)}${shift.Notes ? ` · ${escapeHtml(shift.Notes)}` : ''}</div>
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    ${shift.assignees.length === 0 ? '<span class="text-sm text-base-content/50">Unassigned</span>' : shift.assignees.map((a) => namePill(a.Name)).join('')}
                  </div>
                </div>
              </li>`;
                  })
                  .join('');
}
