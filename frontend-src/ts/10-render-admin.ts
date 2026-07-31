async function renderAdmin(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const users = await api.listUsers();

    container.innerHTML = `
    <section class="space-y-6">
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title">Invite user</h2>
          <form id="invite-user-form" class="grid grid-cols-2 gap-2">
            <input name="email" type="email" class="input input-bordered col-span-2" placeholder="Email" required />
            <input name="name" class="input input-bordered col-span-2" placeholder="Name" required />
            <select name="role" class="select select-bordered">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <select name="departmentId" class="select select-bordered">
              <option value="">No department</option>
              ${dashboard.departments.map((d) => `<option value="${d.Id}">${escapeHtml(d.Name)}</option>`).join('')}
            </select>
            <input name="timezone" class="input input-bordered col-span-2" value="Asia/Kolkata" placeholder="Timezone" />
            <button type="submit" class="btn btn-primary col-span-2">Invite</button>
          </form>
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Users</h2>
          <ul id="user-list" class="divide-y"></ul>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        ${renderSimpleAdminList('Departments', 'department', dashboard.departments, ['Name', 'ShortName'])}
        ${renderSimpleAdminList('Locations', 'location', dashboard.locations, ['Name'])}
        ${renderSimpleAdminList('Equipment types', 'equipment-type', dashboard.equipmentTypes, ['Name', 'Description'])}
        ${renderSimpleAdminList('Links', 'link', dashboard.links, ['Name', 'Url'])}
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title">Home content</h2>
          <form id="home-content-form" class="space-y-2">
            <textarea name="supportMessage" class="textarea textarea-bordered w-full" placeholder="Support message">${escapeHtml(dashboard.homeContent.SupportMessage)}</textarea>
            <textarea name="guidelines" class="textarea textarea-bordered w-full" placeholder="Guidelines">${escapeHtml(dashboard.homeContent.Guidelines)}</textarea>
            <input name="whatsappUrl" class="input input-bordered w-full" value="${escapeHtml(dashboard.homeContent.WhatsappUrl)}" placeholder="WhatsApp URL" />
            <input name="tutorialUrl" class="input input-bordered w-full" value="${escapeHtml(dashboard.homeContent.TutorialUrl)}" placeholder="Tutorial URL" />
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
      </div>

      ${dashboard.failedNotificationCount > 0 ? `<div class="alert alert-warning">${dashboard.failedNotificationCount} notification email(s) failed to send in the last 7 days.</div>` : ''}
    </section>
  `;

    renderUserList(users, dashboard);
    wireInviteUserForm();
    wireSimpleAdminForms();
    wireHomeContentForm();
}

function renderSimpleAdminList(
    title: string,
    kind: string,
    rows: Record<string, any>[],
    fields: string[],
): string {
    return `
    <div class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <h2 class="card-title">${title}</h2>
        <form class="flex gap-2 flex-wrap simple-admin-form" data-kind="${kind}">
          ${fields.map((f) => `<input name="${f}" class="input input-bordered input-sm" placeholder="${f}" ${f === fields[0] ? 'required' : ''} />`).join('')}
          <button type="submit" class="btn btn-sm">Add</button>
        </form>
        <ul class="divide-y">
          ${rows.map((r) => `<li class="py-1 text-sm">${fields.map((f) => escapeHtml(r[f] ?? '')).join(' — ')}</li>`).join('') || '<li class="py-1 text-sm opacity-70">None yet.</li>'}
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
        <li class="py-2 flex justify-between items-center gap-2" data-user-id="${u.Id}">
          <div>
            <div class="font-medium">${escapeHtml(u.Name)} <span class="opacity-60 text-sm">${escapeHtml(u.Email)}</span></div>
            <div class="text-sm opacity-70">${escapeHtml(u.departmentName)} · ${escapeHtml(u.Status)}</div>
          </div>
          <div class="flex gap-2 items-center shrink-0">
            <select class="select select-bordered select-sm role-select" ${u.Id === dashboard.me.Id ? 'disabled' : ''}>
              <option value="member" ${u.Role === 'member' ? 'selected' : ''}>Member</option>
              <option value="admin" ${u.Role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
            <select class="select select-bordered select-sm status-select" ${u.Id === dashboard.me.Id ? 'disabled' : ''}>
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
