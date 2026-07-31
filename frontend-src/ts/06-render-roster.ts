async function renderRoster(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const isAdmin = dashboard.me.Role === 'admin';
    const users = isAdmin ? await api.listUsers() : [];

    container.innerHTML = `
    <section class="space-y-6">
      ${isAdmin ? renderCreateShiftForm(dashboard, users) : ''}
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Shifts</h2>
          <ul id="roster-list" class="divide-y"></ul>
        </div>
      </div>
    </section>
  `;

    renderRosterList(dashboard.upcomingShifts);
    if (isAdmin) wireCreateShiftForm();
}

function renderCreateShiftForm(dashboard: DashboardPayload, users: ProfileDTO[]): string {
    const activeUsers = users.filter((u) => u.Status === 'active');
    return `
    <form id="create-shift-form" class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <h2 class="card-title">Schedule a shift</h2>
        <div class="flex gap-2">
          <input name="startsAt" type="datetime-local" class="input input-bordered flex-1" required />
          <input name="endsAt" type="datetime-local" class="input input-bordered flex-1" required />
        </div>
        <select name="period" class="select select-bordered" required>
          <option value="Morning">Morning</option>
          <option value="Evening">Evening</option>
          <option value="Night">Night</option>
        </select>
        <select name="locationId" class="select select-bordered" required>
          ${dashboard.locations.map((l) => `<option value="${l.Id}">${escapeHtml(l.Name)}</option>`).join('')}
        </select>
        <label class="label-text">Assignees</label>
        <select name="assigneeProfileIds" class="select select-bordered h-32" multiple>
          ${activeUsers.map((u) => `<option value="${u.Id}">${escapeHtml(u.Name)} (${escapeHtml(u.Email)})</option>`).join('')}
        </select>
        <textarea name="notes" class="textarea textarea-bordered" placeholder="Notes"></textarea>
        <button type="submit" class="btn btn-primary">Create shift</button>
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
            ? '<li class="py-2 opacity-70">No shifts scheduled.</li>'
            : shifts
                  .map(
                      (shift) => `
              <li class="py-2">
                <div class="font-medium">${escapeHtml(shift.LocationName)} — ${escapeHtml(shift.Period)}</div>
                <div class="text-sm opacity-70">${formatDateTime(shift.StartsAt)} – ${formatDateTime(shift.EndsAt)}</div>
                <div class="text-sm">${shift.assignees.map((a) => escapeHtml(a.Name)).join(', ') || 'Unassigned'}</div>
              </li>`,
                  )
                  .join('');
}
