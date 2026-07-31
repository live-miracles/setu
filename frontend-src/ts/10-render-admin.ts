async function renderAdmin(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const users = await api.listUsers();
    const activePeople = users.filter((u) => u.Status === 'active').length;

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('shield', 'Admin', 'People, master data and app settings.')}

      ${
          dashboard.failedNotificationCount > 0
              ? `<div class="alert alert-warning">
                  ${icon('alert', 'size-5')}
                  <span>${dashboard.failedNotificationCount} notification email(s) failed to send in the last 7 days.</span>
                </div>`
              : ''
      }

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Invite person</h2>
          <form id="invite-user-form" class="space-y-3">
            <fieldset class="fieldset">
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="invite-email">Email</label>
                  <input id="invite-email" name="email" type="email" class="input w-full" placeholder="name@company.com" required />
                </div>
                <div>
                  <label class="label" for="invite-name">Name</label>
                  <input id="invite-name" name="name" class="input w-full" required />
                </div>
                <div>
                  <label class="label" for="invite-role">Role</label>
                  <select id="invite-role" name="role" class="select w-full">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label class="label" for="invite-department">Department</label>
                  <select id="invite-department" name="departmentId" class="select w-full">
                    <option value="">No department</option>
                    ${dashboard.departments.map((d) => `<option value="${d.Id}">${escapeHtml(d.Name)}</option>`).join('')}
                  </select>
                </div>
                <div class="sm:col-span-2">
                  <label class="label" for="invite-timezone">Time zone</label>
                  <input id="invite-timezone" name="timezone" class="input w-full" value="Asia/Kolkata" />
                </div>
              </div>
            </fieldset>
            <button type="submit" class="btn btn-primary">Invite</button>
          </form>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base">${icon('user', 'size-5 text-primary')} People</h2>
            <span class="text-xs text-base-content/50">${activePeople} active</span>
          </div>
          <ul id="user-list" class="divide-y divide-base-200"></ul>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        ${renderSimpleAdminList('Departments', 'user', 'department', dashboard.departments, [
            { field: 'Name', label: 'Name' },
            { field: 'ShortName', label: 'Short name' },
        ])}
        ${renderSimpleAdminList('Locations', 'pin', 'location', dashboard.locations, [
            { field: 'Name', label: 'Name' },
        ])}
        ${renderSimpleAdminList(
            'Equipment types',
            'box',
            'equipment-type',
            dashboard.equipmentTypes,
            [
                { field: 'Name', label: 'Name' },
                { field: 'Description', label: 'Description' },
            ],
        )}
        ${renderSimpleAdminList('Quick links', 'external', 'link', dashboard.links, [
            { field: 'Name', label: 'Name' },
            { field: 'Url', label: 'URL' },
        ])}
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('home', 'size-5 text-primary')} Home content</h2>
          <form id="home-content-form" class="space-y-3">
            <fieldset class="fieldset">
              <label class="label" for="home-support-message">Support message</label>
              <textarea id="home-support-message" name="supportMessage" class="textarea w-full" placeholder="Shown at the top of Home">${escapeHtml(dashboard.homeContent.SupportMessage)}</textarea>
              <label class="label" for="home-guidelines">Guidelines</label>
              <textarea id="home-guidelines" name="guidelines" class="textarea w-full" placeholder="Studio safety and operating guidelines">${escapeHtml(dashboard.homeContent.Guidelines)}</textarea>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="home-whatsapp">WhatsApp URL</label>
                  <input id="home-whatsapp" name="whatsappUrl" class="input w-full" value="${escapeHtml(dashboard.homeContent.WhatsappUrl)}" />
                </div>
                <div>
                  <label class="label" for="home-tutorial">Tutorial URL</label>
                  <input id="home-tutorial" name="tutorialUrl" class="input w-full" value="${escapeHtml(dashboard.homeContent.TutorialUrl)}" />
                </div>
              </div>
            </fieldset>
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
      </div>
    </section>
  `;

    renderUserList(users, dashboard);
    wireInviteUserForm();
    wireSimpleAdminForms();
    wireHomeContentForm();
}

function renderSimpleAdminList(
    title: string,
    iconName: IconName,
    kind: string,
    rows: Record<string, any>[],
    fields: { field: string; label: string }[],
): string {
    return `
    <div class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body gap-2">
        <h2 class="card-title text-base">${icon(iconName, 'size-5 text-primary')} ${title}</h2>
        <form class="simple-admin-form flex flex-wrap items-end gap-2" data-kind="${kind}">
          ${fields
              .map(
                  (f, i) => `
            <div class="flex-1" style="min-width: 8rem;">
              <label class="label text-xs">${escapeHtml(f.label)}</label>
              <input name="${f.field}" class="input input-sm w-full" ${i === 0 ? 'required' : ''} />
            </div>`,
              )
              .join('')}
          <button type="submit" class="btn btn-sm">Add</button>
        </form>
        <ul class="divide-y divide-base-200">
          ${rows.map((r) => `<li class="py-1.5 text-sm">${fields.map((f) => escapeHtml(r[f.field] ?? '')).join(' — ')}</li>`).join('') || `<li class="py-1.5 text-sm text-base-content/50">None yet.</li>`}
        </ul>
      </div>
    </div>
  `;
}

function wireSimpleAdminForms(): void {
    document.querySelectorAll('form.simple-admin-form').forEach((form) => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const kind = (form as HTMLElement).dataset.kind!;
            const data = new FormData(form as HTMLFormElement);
            try {
                showSavingBadge(true);
                const requestId = generateRequestId();
                if (kind === 'department') {
                    await api.createDepartment(
                        {
                            name: String(data.get('Name')),
                            shortName: String(data.get('ShortName') || ''),
                        },
                        requestId,
                    );
                } else if (kind === 'location') {
                    await api.createLocation({ name: String(data.get('Name')) }, requestId);
                } else if (kind === 'equipment-type') {
                    await api.createEquipmentType(
                        {
                            name: String(data.get('Name')),
                            description: String(data.get('Description') || ''),
                            requestable: true,
                        },
                        requestId,
                    );
                } else if (kind === 'link') {
                    await api.createLink(
                        {
                            name: String(data.get('Name')),
                            url: String(data.get('Url')),
                            displayOrder: 0,
                            enabled: true,
                        },
                        requestId,
                    );
                }
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            } finally {
                showSavingBadge(false);
            }
        });
    });
}

function renderUserList(users: ProfileDTO[], dashboard: DashboardPayload): void {
    const list = document.getElementById('user-list');
    if (!list) return;
    list.innerHTML = users
        .map(
            (u) => `
        <li class="flex flex-wrap items-center justify-between gap-3 py-2.5" data-user-id="${u.Id}">
          <div class="min-w-0">
            <div class="font-medium">${escapeHtml(u.Name)} <span class="text-sm font-normal opacity-60">${escapeHtml(u.Email)}</span></div>
            <div class="text-sm text-base-content/60">${escapeHtml(u.departmentName || 'No department')}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <select class="select select-sm role-select" ${u.Id === dashboard.me.Id ? 'disabled' : ''} aria-label="Role for ${escapeHtml(u.Name)}">
              <option value="member" ${u.Role === 'member' ? 'selected' : ''}>Member</option>
              <option value="admin" ${u.Role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
            <select class="select select-sm status-select" ${u.Id === dashboard.me.Id ? 'disabled' : ''} aria-label="Status for ${escapeHtml(u.Name)}">
              <option value="invited" ${u.Status === 'invited' ? 'selected' : ''}>Invited</option>
              <option value="active" ${u.Status === 'active' ? 'selected' : ''}>Active</option>
              <option value="disabled" ${u.Status === 'disabled' ? 'selected' : ''}>Disabled</option>
            </select>
          </div>
        </li>`,
        )
        .join('');

    list.querySelectorAll('li[data-user-id]').forEach((li) => {
        const userId = (li as HTMLElement).dataset.userId!;
        const roleSelect = li.querySelector('.role-select') as HTMLSelectElement;
        const statusSelect = li.querySelector('.status-select') as HTMLSelectElement;

        async function saveChange(patch: UpdateUserInput): Promise<void> {
            try {
                showSavingBadge(true);
                await api.updateUser(userId, patch);
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            } finally {
                showSavingBadge(false);
            }
        }

        roleSelect.addEventListener('change', () =>
            saveChange({ role: roleSelect.value as UserRole }),
        );
        statusSelect.addEventListener('change', () =>
            saveChange({ status: statusSelect.value as ProfileStatus }),
        );
    });
}

function wireInviteUserForm(): void {
    const form = document.getElementById('invite-user-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        try {
            showSavingBadge(true);
            await api.inviteUser(
                {
                    email: String(data.get('email')),
                    name: String(data.get('name')),
                    role: String(data.get('role')) as UserRole,
                    departmentId: String(data.get('departmentId') || ''),
                    timezone: String(data.get('timezone') || 'Asia/Kolkata'),
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

function wireHomeContentForm(): void {
    const form = document.getElementById('home-content-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        try {
            showSavingBadge(true);
            await api.updateHomeContent({
                supportMessage: String(data.get('supportMessage') || ''),
                guidelines: String(data.get('guidelines') || ''),
                whatsappUrl: String(data.get('whatsappUrl') || ''),
                tutorialUrl: String(data.get('tutorialUrl') || ''),
            });
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}
