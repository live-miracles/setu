async function renderProfile(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const me = dashboard.me;
    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('user', 'Profile', 'Your contact details.')}

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-lg font-bold">${escapeHtml(me.Name)}</h2>
              <p class="text-sm text-base-content/60">${escapeHtml(me.Email)}</p>
            </div>
            <span class="badge badge-soft ${me.Role === 'admin' ? 'badge-secondary' : 'badge-ghost'}">${escapeHtml(me.Role)}</span>
          </div>
          <div class="grid gap-3 border-t border-base-200 pt-3 sm:grid-cols-2">
            <div>
              <div class="text-xs uppercase tracking-wide text-base-content/50">Department</div>
              <div class="text-sm">${escapeHtml(me.departmentName || 'Not set')}</div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-base-content/50">Time zone</div>
              <div class="text-sm">${escapeHtml(me.Timezone || 'Not set')}</div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-base-content/50">Phone</div>
              <div class="text-sm">${escapeHtml(me.Phone || 'Not set')}</div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-base-content/50">WhatsApp</div>
              <div class="text-sm">${escapeHtml(me.Whatsapp || 'Not set')}</div>
            </div>
          </div>
          <p class="border-t border-base-200 pt-3 text-xs text-base-content/50">Signed in with your Google account. Contact an admin to change your role.</p>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">Edit profile</h2>
          <form id="profile-form" class="space-y-3">
            <fieldset class="fieldset">
              <label class="label" for="profile-name">Name</label>
              <input id="profile-name" name="name" class="input w-full" value="${escapeHtml(me.Name)}" required />
              <label class="label" for="profile-department">Department</label>
              ${renderDepartmentSelect('profile-department', dashboard.departments, me.DepartmentId)}
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="profile-phone">Phone</label>
                  <input id="profile-phone" name="phone" class="input w-full" value="${escapeHtml(me.Phone)}" required />
                </div>
                <div>
                  <label class="label" for="profile-whatsapp">WhatsApp</label>
                  <input id="profile-whatsapp" name="whatsapp" class="input w-full" value="${escapeHtml(me.Whatsapp)}" />
                </div>
              </div>
              <label class="label" for="profile-timezone">Time zone</label>
              <input id="profile-timezone" name="timezone" class="input w-full" value="${escapeHtml(me.Timezone)}" />
            </fieldset>
            <button type="submit" class="btn btn-primary">Save changes</button>
          </form>
        </div>
      </div>
    </section>
  `;

    const form = document.getElementById('profile-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        try {
            showSavingBadge(true);
            await api.updateOwnProfile({
                name: String(data.get('name')),
                departmentId: String(data.get('departmentId') || ''),
                phone: String(data.get('phone') || ''),
                whatsapp: String(data.get('whatsapp') || ''),
                timezone: String(data.get('timezone') || ''),
            });
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function renderDepartmentSelect(
    id: string,
    departments: Department[],
    selectedId: string,
): string {
    const options = departments
        .map(
            (d) =>
                `<option value="${d.Id}" ${d.Id === selectedId ? 'selected' : ''}>${escapeHtml(d.Name)}</option>`,
        )
        .join('');
    return `<select id="${id}" name="departmentId" class="select w-full">
      <option value="" ${selectedId ? '' : 'selected'}>No department yet</option>
      ${options}
    </select>`;
}

// Shown instead of the normal app shell while User.Phone is unset (see
// Auth.ts/Admin.ts) — 12-main.ts's renderCurrentSection gates on that and
// hides all nav until this form is submitted. Reuses updateOwnProfile
// rather than a separate endpoint since completing this form and later
// editing your profile are the same action server-side.
async function renderRegistrationGate(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const me = dashboard.me;
    container.innerHTML = `
    <section class="mx-auto max-w-lg space-y-6">
      <div class="flex flex-col items-center gap-3 pt-4 text-center">
        <div class="flex size-14 items-center justify-center rounded-box bg-primary/10 text-primary">
          ${icon('user', 'size-7')}
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight">Welcome</h1>
          <p class="text-sm text-base-content/60">Complete your profile to access the app.</p>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <form id="registration-form" class="space-y-3">
            <fieldset class="fieldset">
              <label class="label" for="reg-name">Name</label>
              <input id="reg-name" name="name" class="input w-full" value="${escapeHtml(me.Name)}" required />
              <label class="label" for="reg-department">Department</label>
              ${renderDepartmentSelect('reg-department', dashboard.departments, me.DepartmentId)}
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="reg-phone">Phone</label>
                  <input id="reg-phone" name="phone" class="input w-full" value="${escapeHtml(me.Phone)}" required />
                </div>
                <div>
                  <label class="label" for="reg-whatsapp">WhatsApp</label>
                  <input id="reg-whatsapp" name="whatsapp" class="input w-full" value="${escapeHtml(me.Whatsapp)}" />
                </div>
              </div>
              <label class="label" for="reg-timezone">Time zone</label>
              <input id="reg-timezone" name="timezone" class="input w-full" value="${escapeHtml(me.Timezone)}" />
            </fieldset>
            <button type="submit" class="btn btn-primary w-full">Get started</button>
          </form>
        </div>
      </div>
    </section>
  `;

    const form = document.getElementById('registration-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        try {
            showSavingBadge(true);
            await api.updateOwnProfile({
                name: String(data.get('name')),
                departmentId: String(data.get('departmentId') || ''),
                phone: String(data.get('phone') || ''),
                whatsapp: String(data.get('whatsapp') || ''),
                timezone: String(data.get('timezone') || ''),
            });
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}
