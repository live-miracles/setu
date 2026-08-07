import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
import { renderEmptyState } from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml } from '../ui/format';
import type { IconName } from '../ui/icons';
import { icon } from '../ui/icons';
import {
    stockLevelClass,
    USER_ROLE_LABELS,
    USER_ROLE_ORDER,
    USER_ROLE_SUMMARIES,
    roleBadgeClass,
    roleLabel,
} from '../ui/styles';
import { canManageConfig } from '../workflows';

// The Settings pages. What used to be one Admin section is now a page per
// list, reached from the navbar's Settings dropdown: Users, open to
// approvers read-only, plus the admin-only config pages. router.ts hides
// the dropdown entries a role can't open, and every write below is
// re-checked server-side (requireAdmin/requireApprover in Admin.ts).

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const CREATE_USER_MODAL_ID = 'create-user-modal';
const EDIT_USER_MODAL_ID = 'edit-user-modal';
let selectedUserEmail: string | null = null;

export async function renderUsers(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const isAdmin = canManageConfig(dashboard.me);
    const users = await api.listUsers();
    const selectedUser = selectedUserEmail
        ? users.find((user) => user.Email === selectedUserEmail) || null
        : null;
    if (selectedUserEmail && !selectedUser) selectedUserEmail = null;

    container.innerHTML = `
    <section class="space-y-6">
      ${
          selectedUser
              ? renderUserDetail(selectedUser, dashboard, isAdmin)
              : renderUserListCard(users, isAdmin)
      }
      ${isAdmin ? renderUserCreateModal(dashboard.departments) + renderUserEditModal(dashboard.departments) : ''}
    </section>
  `;

    wireUserControls(container, dashboard, users, isAdmin);
}

function renderRoleLegend(): string {
    return `
    <dl class="mt-1 grid gap-x-3 gap-y-1 border-t border-base-200 pt-3 text-xs sm:grid-cols-[auto_1fr]">
      ${USER_ROLE_ORDER.map(
          (role) => `
        <dt class="font-medium">${escapeHtml(USER_ROLE_LABELS[role])}</dt>
        <dd class="text-base-content/60 max-sm:mb-1">${escapeHtml(USER_ROLE_SUMMARIES[role])}</dd>`,
      ).join('')}
    </dl>`;
}

function renderUserListCard(users: UserDTO[], isAdmin: boolean): string {
    return `
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 class="card-title text-base">${users.length} ${users.length === 1 ? 'person' : 'people'}</h2>
              <span class="text-xs text-base-content/50">from your Google domain</span>
            </div>
            ${isAdmin ? `<button type="button" class="btn btn-primary btn-sm btn-square" id="open-create-user-modal" aria-label="Add user">${icon('plus', 'size-4')}</button>` : ''}
          </div>
          <p class="text-sm text-base-content/60">People self-register automatically the first time they sign in from your organisation's Google domain. ${
              isAdmin
                  ? 'Use the add and edit forms to maintain access details.'
                  : "Only an admin can change someone's details."
          }</p>
          <ul id="user-list" class="divide-y divide-base-200">
            ${users
                .map(
                    (u) => `
        <li class="flex cursor-pointer flex-wrap items-center justify-between gap-3 py-2.5 transition hover:bg-base-200/45" data-user-id="${escapeHtml(u.Email)}">
          <div class="min-w-0">
            <div class="font-medium">${escapeHtml(u.Name)} <span class="text-sm font-normal opacity-60">${escapeHtml(u.Email)}</span></div>
            <div class="text-sm text-base-content/60">${escapeHtml(u.departmentName || 'No department')}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="badge badge-soft badge-sm ${roleBadgeClass(u.Role)}">${escapeHtml(roleLabel(u.Role))}</span>
          </div>
        </li>`,
                )
                .join('')}
          </ul>
          ${isAdmin ? renderRoleLegend() : ''}
        </div>
      </div>`;
}

function renderUserRequestRows(
    requests: { label: string; status: string; dates: string }[],
): string {
    return requests.length
        ? `<div class="overflow-x-auto"><table class="table table-sm">
          <thead><tr><th>Request</th><th>Status</th><th>Dates</th></tr></thead>
          <tbody>${requests
              .map(
                  (request) => `<tr>
                    <td>${escapeHtml(request.label)}</td>
                    <td><span class="badge badge-ghost badge-sm">${escapeHtml(request.status)}</span></td>
                    <td>${escapeHtml(request.dates)}</td>
                  </tr>`,
              )
              .join('')}</tbody>
        </table></div>`
        : '<p class="text-sm text-base-content/50">No requests raised yet.</p>';
}

function renderUserDetail(user: UserDTO, dashboard: DashboardPayload, isAdmin: boolean): string {
    const equipmentRequests = dashboard.inventoryRequests
        .filter((request) => request.UserId === user.Email)
        .map((request) => ({
            label: `REQ-${request.DisplayId} · ${request.Name}`,
            status: request.Status,
            dates:
                request.StartDate === request.EndDate
                    ? request.StartDate
                    : `${request.StartDate} – ${request.EndDate}`,
        }));
    const programRequests = dashboard.programRequests
        .filter((request) => request.UserId === user.Email)
        .map((request) => ({
            label: `PRG-${request.DisplayId} · ${request.Name}`,
            status: request.Status,
            dates: request.sessions[0]
                ? request.sessions[0].StartDateTime.slice(0, 10)
                : 'No session',
        }));

    return `
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <button type="button" id="back-to-users" class="btn btn-ghost btn-xs mb-3">${icon('chevronLeft', 'size-4')} Users</button>
              <h2 class="card-title text-base">${escapeHtml(user.Name)}</h2>
              <p class="text-sm text-base-content/60">${escapeHtml(user.Email)}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-soft badge-sm ${roleBadgeClass(user.Role)}">${escapeHtml(roleLabel(user.Role))}</span>
              ${isAdmin ? `<button type="button" class="btn btn-primary btn-sm" data-user-edit="${escapeHtml(user.Email)}">${icon('edit', 'size-4')} Edit</button>` : ''}
            </div>
          </div>

          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-xs font-semibold text-base-content/50">Department</dt><dd>${escapeHtml(user.departmentName || 'No department')}</dd></div>
            <div><dt class="text-xs font-semibold text-base-content/50">Phone</dt><dd>${escapeHtml(user.Phone || 'Not added')}</dd></div>
            <div><dt class="text-xs font-semibold text-base-content/50">WhatsApp</dt><dd>${escapeHtml(user.Whatsapp || 'Not added')}</dd></div>
          </dl>

          <section class="border-t border-base-200 pt-4">
            <h3 class="mb-2 text-sm font-semibold">Equipment requests</h3>
            ${renderUserRequestRows(equipmentRequests)}
          </section>
          <section class="border-t border-base-200 pt-4">
            <h3 class="mb-2 text-sm font-semibold">Program requests</h3>
            ${renderUserRequestRows(programRequests)}
          </section>
        </div>
      </div>`;
}

function renderDepartmentOptions(departments: Department[], selected = ''): string {
    return `<option value="">No department</option>${departments
        .map(
            (department) =>
                `<option value="${escapeHtml(department.Id)}" ${department.Id === selected ? 'selected' : ''}>${escapeHtml(department.Name)}</option>`,
        )
        .join('')}`;
}

function renderRoleOptions(selected: UserRole = 'user'): string {
    return USER_ROLE_ORDER.map(
        (role) =>
            `<option value="${role}" ${role === selected ? 'selected' : ''}>${escapeHtml(USER_ROLE_LABELS[role])}</option>`,
    ).join('');
}

function renderUserFormFields(departments: Department[], includeEmail: boolean): string {
    return `
      ${includeEmail ? '<input type="hidden" name="emailOriginal" />' : '<input type="hidden" name="emailOriginal" />'}
      <div class="grid gap-3 sm:grid-cols-2">
        ${
            includeEmail
                ? `<label class="fieldset"><span class="label">Email</span><input name="email" type="email" class="input w-full" required /></label>`
                : '<input name="email" type="hidden" />'
        }
        <label class="fieldset"><span class="label">Name</span><input name="name" class="input w-full" required /></label>
        <label class="fieldset"><span class="label">Role</span><select name="role" class="select w-full">${renderRoleOptions()}</select></label>
        <label class="fieldset"><span class="label">Department</span><select name="departmentId" class="select w-full">${renderDepartmentOptions(departments)}</select></label>
        <label class="fieldset"><span class="label">Phone</span><input name="phone" class="input w-full" /></label>
        <label class="fieldset"><span class="label">WhatsApp</span><input name="whatsapp" class="input w-full" /></label>
      </div>`;
}

function renderUserCreateModal(departments: Department[]): string {
    return `
      <dialog id="${CREATE_USER_MODAL_ID}" class="modal">
        <div class="modal-box w-11/12 max-w-[50rem]">
          <h3 class="mb-4 flex items-center gap-2 text-base font-semibold">${icon('plus', 'size-5 text-primary')} Add user</h3>
          <form id="create-user-form" class="space-y-3">
            ${renderUserFormFields(departments, true)}
            <div class="modal-action"><button type="button" class="btn btn-ghost" data-user-modal-close="${CREATE_USER_MODAL_ID}">Cancel</button><button type="submit" class="btn btn-primary">Add</button></div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>`;
}

function renderUserEditModal(departments: Department[]): string {
    return `
      <dialog id="${EDIT_USER_MODAL_ID}" class="modal">
        <div class="modal-box w-11/12 max-w-[50rem]">
          <h3 class="mb-4 flex items-center gap-2 text-base font-semibold">${icon('edit', 'size-5 text-primary')} Edit user</h3>
          <form id="edit-user-form" class="space-y-3">
            ${renderUserFormFields(departments, false)}
            <div class="modal-action"><button type="button" class="btn btn-ghost" data-user-modal-close="${EDIT_USER_MODAL_ID}">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>`;
}

function readUserForm(form: HTMLFormElement): CreateUserInput {
    const data = new FormData(form);
    return {
        email: String(data.get('email') || '')
            .trim()
            .toLowerCase(),
        name: String(data.get('name') || ''),
        role: String(data.get('role') || 'user') as UserRole,
        departmentId: String(data.get('departmentId') || ''),
        phone: String(data.get('phone') || ''),
        whatsapp: String(data.get('whatsapp') || ''),
    };
}

function fillUserEditForm(form: HTMLFormElement, user: UserDTO): void {
    (form.elements.namedItem('email') as HTMLInputElement).value = user.Email;
    (form.elements.namedItem('emailOriginal') as HTMLInputElement).value = user.Email;
    (form.elements.namedItem('name') as HTMLInputElement).value = user.Name;
    (form.elements.namedItem('role') as HTMLSelectElement).value = user.Role;
    (form.elements.namedItem('departmentId') as HTMLSelectElement).value = user.DepartmentId || '';
    (form.elements.namedItem('phone') as HTMLInputElement).value = user.Phone || '';
    (form.elements.namedItem('whatsapp') as HTMLInputElement).value = user.Whatsapp || '';
}

function wireUserControls(
    container: HTMLElement,
    dashboard: DashboardPayload,
    users: UserDTO[],
    isAdmin: boolean,
): void {
    document.getElementById('back-to-users')?.addEventListener('click', () => {
        selectedUserEmail = null;
        renderUsers(container, dashboard);
    });

    document.querySelectorAll<HTMLElement>('[data-user-id]').forEach((row) => {
        row.addEventListener('click', () => {
            selectedUserEmail = row.dataset.userId || null;
            renderUsers(container, dashboard);
        });
    });

    if (!isAdmin) return;

    document.getElementById('open-create-user-modal')?.addEventListener('click', () => {
        const form = document.getElementById('create-user-form') as HTMLFormElement | null;
        form?.reset();
        (document.getElementById(CREATE_USER_MODAL_ID) as HTMLDialogElement | null)?.showModal();
    });

    document.querySelectorAll<HTMLButtonElement>('[data-user-modal-close]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.userModalClose;
            if (modalId) (document.getElementById(modalId) as HTMLDialogElement | null)?.close();
        });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-user-edit]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const user = users.find((u) => u.Email === btn.dataset.userEdit);
            const form = document.getElementById('edit-user-form') as HTMLFormElement | null;
            if (!user || !form) return;
            fillUserEditForm(form, user);
            (document.getElementById(EDIT_USER_MODAL_ID) as HTMLDialogElement | null)?.showModal();
        });
    });

    document.getElementById('create-user-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        try {
            showSavingBadge(true);
            const created = await api.createUser(readUserForm(form), generateRequestId());
            selectedUserEmail = created.Email;
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });

    document.getElementById('edit-user-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const values = readUserForm(form);
        const email = String(new FormData(form).get('emailOriginal') || values.email);
        try {
            showSavingBadge(true);
            await api.updateUser(email, {
                name: values.name,
                role: values.role,
                departmentId: values.departmentId,
                phone: values.phone,
                whatsapp: values.whatsapp,
            });
            selectedUserEmail = email;
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

// ---------------------------------------------------------------------------
// Departments / Places / Inventory types / Quick links — four lists that
// differ only in their columns and which dashboard array they read, so they
// share one add-form-plus-list renderer. The first three are pages of their
// own (keyed by SectionKey below); quick links ride along on the Home
// content page instead. `kind` is what wireSettingsForm switches on to pick
// the create endpoint.
// ---------------------------------------------------------------------------

// Everything the add-form and list cards need.
interface SettingsList {
    kind: string;
    title: string;
    iconName: IconName;
    addLabel: string;
    emptyMessage: string;
    fields: { field: string; label: string; type?: string }[];
    rowAccessory?: (row: Record<string, any>) => string;
}

// A list that also gets a page to itself, so it needs a header subtitle and
// a way to find its rows on the dashboard payload.
interface SettingsListPage extends SettingsList {
    subtitle: string;
    rows: (dashboard: DashboardPayload) => Record<string, any>[];
}

export const SETTINGS_LIST_PAGES: Record<string, SettingsListPage> = {
    departments: {
        kind: 'department',
        title: 'Departments',
        subtitle: 'Teams people can belong to.',
        iconName: 'user',
        addLabel: 'Add a department',
        emptyMessage: 'No departments yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'ShortName', label: 'Short name' },
            { field: 'LeadEmail', label: 'Lead email' },
        ],
        rows: (dashboard) => dashboard.departments,
    },
    places: {
        kind: 'place',
        title: 'Places',
        subtitle: 'Studios and rooms a program can be booked into.',
        iconName: 'pin',
        addLabel: 'Add a place',
        emptyMessage: 'No places yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (dashboard) => dashboard.places,
    },
    'inventory-types': {
        kind: 'inventory-type',
        title: 'Inventory types',
        subtitle: 'The equipment catalogue people request from.',
        iconName: 'box',
        addLabel: 'Add equipment',
        emptyMessage: 'No equipment catalogued yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'Description', label: 'Description' },
            { field: 'TotalQuantity', label: 'Total qty' },
        ],
        rowAccessory: renderInventoryTypeAvailability,
        rows: (dashboard) => dashboard.inventoryTypes,
    },
};

// Not in the map above: links have no page of their own, so this is a plain
// SettingsList that renderHomeContent embeds.
const SETTINGS_LINKS_LIST: SettingsList = {
    kind: 'link',
    title: 'Quick links',
    iconName: 'external',
    addLabel: 'Add a quick link',
    emptyMessage: 'No links yet.',
    fields: [
        { field: 'Name', label: 'Name' },
        { field: 'Url', label: 'URL' },
    ],
};

// Also embedded rather than a page of its own. Picking one of these by name
// in the roster's "Schedule a shift" form prefills its default start/end
// time — see wireCreateShiftForm in roster.ts.
const SETTINGS_SHIFT_PRESETS_LIST: SettingsList = {
    kind: 'shift-preset',
    title: 'Shift presets',
    iconName: 'calendar',
    addLabel: 'Add a shift preset',
    emptyMessage: 'No shift presets yet.',
    fields: [
        { field: 'Name', label: 'Name' },
        { field: 'DefaultStartTime', label: 'Default start time', type: 'time' },
        { field: 'DefaultEndTime', label: 'Default end time', type: 'time' },
    ],
};

// Keyed by `kind` (not by the page-map keys above, which are plural/page
// slugs) so a row's own data-kind attribute can look up its field list for
// the inline edit form and dispatch its update/delete call — see
// wireSettingsRow below.
const SETTINGS_LIST_BY_KIND: Record<string, SettingsList> = {
    ...Object.fromEntries(Object.values(SETTINGS_LIST_PAGES).map((p) => [p.kind, p])),
    [SETTINGS_LINKS_LIST.kind]: SETTINGS_LINKS_LIST,
    [SETTINGS_SHIFT_PRESETS_LIST.kind]: SETTINGS_SHIFT_PRESETS_LIST,
};

export function renderSettingsList(
    page: SettingsListPage,
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    const createInModal = true;
    container.innerHTML = `
    <section class="space-y-6">
      ${renderSettingsListCardsWithOptions(page, page.rows(dashboard), createInModal)}
    </section>
  `;

    wireSettingsForm();
    if (createInModal) wireSettingsCreateModals();
    wireSettingsListRows();
}

// The add-form and list cards on their own, so Home content can embed the
// Quick links pair below its own form instead of owning a whole page.
function settingsCreateModalId(kind: string): string {
    return `settings-create-${kind}-modal`;
}

function renderSettingsCreateFields(page: SettingsList): string {
    return page.fields
        .map(
            (f, i) => `
              <div class="min-w-48 flex-1">
                <label class="label text-xs">${escapeHtml(f.label)}</label>
                <input name="${f.field}" type="${f.type || 'text'}" class="input input-sm w-full" ${i === 0 ? 'required' : ''} />
              </div>`,
        )
        .join('');
}

function renderSettingsCreateModal(page: SettingsList): string {
    return `
      <dialog id="${settingsCreateModalId(page.kind)}" class="modal">
        <div class="modal-box w-11/12 max-w-[50rem]">
          <h3 class="mb-4 flex items-center gap-2 text-base font-semibold">${icon('plus', 'size-5 text-primary')} ${escapeHtml(page.addLabel)}</h3>
          <form class="settings-form space-y-3" data-kind="${page.kind}">
            <div class="flex flex-wrap items-end gap-3">
              ${renderSettingsCreateFields(page)}
            </div>
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" data-settings-modal-close="${page.kind}">Cancel</button>
              <button type="submit" class="btn btn-primary">Add</button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>`;
}

function renderSettingsListCardsWithOptions(
    page: SettingsList,
    rows: Record<string, any>[],
    createInModal: boolean,
): string {
    return `
      ${
          createInModal
              ? ''
              : `<div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} ${escapeHtml(page.addLabel)}</h2>
          <form class="settings-form flex flex-wrap items-end gap-2" data-kind="${page.kind}">
            ${renderSettingsCreateFields(page)}
            <button type="submit" class="btn btn-sm btn-primary">Add</button>
          </form>
        </div>
      </div>`
      }

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <h2 class="card-title text-base">${escapeHtml(page.title)}</h2>
              <span class="badge badge-ghost badge-sm">${rows.length}</span>
            </div>
            ${
                createInModal
                    ? `<button type="button" class="btn btn-primary btn-sm btn-square" data-settings-modal-open="${page.kind}" aria-label="${escapeHtml(page.addLabel)}">${icon('plus', 'size-4')}</button>`
                    : ''
            }
          </div>
          ${
              rows.length === 0
                  ? renderEmptyState(page.iconName, page.emptyMessage)
                  : `<ul class="divide-y divide-base-200">${rows
                        .map((r) => renderSettingsRowHtml(page, r))
                        .join('')}</ul>`
          }
        </div>
      </div>
      ${createInModal ? renderSettingsCreateModal(page) : ''}`;
}

// A row's read-only view: name + the rest of its fields, plus edit/delete.
// Shared between the initial render and restoring a row after Cancel.
function renderSettingsRowViewInner(page: SettingsList, row: Record<string, any>): string {
    return `
      <div class="flex flex-wrap items-baseline gap-x-2">
        <span class="font-medium">${escapeHtml(row[page.fields[0].field] ?? '')}</span>
        ${page.fields
            .slice(1)
            .map(
                (f) =>
                    `<span class="text-base-content/60">${escapeHtml(row[f.field] ?? '')}</span>`,
            )
            .join('')}
        ${page.rowAccessory ? page.rowAccessory(row) : ''}
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button type="button" class="btn btn-ghost btn-xs settings-row-edit" aria-label="Edit ${escapeHtml(row[page.fields[0].field] ?? '')}">${icon('edit', 'size-4')}</button>
        <button type="button" class="btn btn-ghost btn-xs text-error settings-row-delete" aria-label="Delete ${escapeHtml(row[page.fields[0].field] ?? '')}">${icon('trash', 'size-4')}</button>
      </div>`;
}

// data-raw-<Field> carries each field's untouched value so edit mode (and a
// Cancel back out of it) can rebuild the row without re-fetching — HTML
// attribute names/lookups are case-insensitive, so the PascalCase field
// names round-trip fine as long as they're written and read the same way.
function renderSettingsRowHtml(page: SettingsList, row: Record<string, any>): string {
    const rawAttrs = page.fields
        .map((f) => `data-raw-${f.field}="${escapeHtml(String(row[f.field] ?? ''))}"`)
        .join(' ');
    return `
    <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-id="${escapeHtml(row.Id ?? '')}" data-kind="${page.kind}" ${rawAttrs}>${renderSettingsRowViewInner(page, row)}</li>`;
}

function renderInventoryTypeAvailability(row: Record<string, any>): string {
    const total = Number(row.TotalQuantity || 0);
    const available = Number(row.availableQuantity || 0);
    const stock = stockLevelClass(available, total);
    return `<span class="flex min-w-32 items-center gap-2 text-xs ${stock.text}"><span>Available</span><strong>${available}/${total}</strong><progress class="progress ${stock.bar} h-1.5 w-20" value="${Math.max(0, available)}" max="${Math.max(1, total)}"></progress></span>`;
}

// The inline edit form for a row, reusing the same field list as the add
// form above.
function renderSettingsRowEditInner(page: SettingsList, row: Record<string, any>): string {
    return `
      <form class="settings-row-edit-form flex flex-1 flex-wrap items-end gap-2">
        ${page.fields
            .map(
                (f, i) => `
          <div class="flex-1" style="min-width: 8rem;">
            <label class="label text-xs">${escapeHtml(f.label)}</label>
            <input name="${f.field}" type="${f.type || 'text'}" class="input input-sm w-full" value="${escapeHtml(String(row[f.field] ?? ''))}" ${i === 0 ? 'required' : ''} />
          </div>`,
            )
            .join('')}
        <div class="flex shrink-0 items-center gap-1">
          <button type="submit" class="btn btn-primary btn-xs">Save</button>
          <button type="button" class="btn btn-ghost btn-xs settings-row-cancel">Cancel</button>
        </div>
      </form>`;
}

function readRowValuesFromLi(li: HTMLElement, page: SettingsList, id: string): Record<string, any> {
    const row: Record<string, any> = { Id: id };
    page.fields.forEach((f) => {
        row[f.field] = li.getAttribute('data-raw-' + f.field) || '';
    });
    return row;
}

async function updateSettingsRow(
    kind: string,
    id: string,
    v: Record<string, string>,
    requestId: string,
): Promise<void> {
    if (kind === 'department') {
        await api.updateDepartment(
            id,
            { name: v.Name, shortName: v.ShortName || '', leadEmail: v.LeadEmail || '' },
            requestId,
        );
    } else if (kind === 'place') {
        await api.updatePlace(id, { name: v.Name }, requestId);
    } else if (kind === 'inventory-type') {
        await api.updateInventoryType(
            id,
            {
                name: v.Name,
                description: v.Description || '',
                requestable: true,
                totalQuantity: Number(v.TotalQuantity || 0),
            },
            requestId,
        );
    } else if (kind === 'link') {
        await api.updateLink(id, { name: v.Name, url: v.Url, enabled: true }, requestId);
    } else if (kind === 'shift-preset') {
        await api.updateShiftPreset(
            id,
            {
                name: v.Name,
                defaultStartTime: v.DefaultStartTime || '',
                defaultEndTime: v.DefaultEndTime || '',
            },
            requestId,
        );
    }
}

async function deleteSettingsRow(kind: string, id: string, requestId: string): Promise<void> {
    if (kind === 'department') await api.deleteDepartment(id, requestId);
    else if (kind === 'place') await api.deletePlace(id, requestId);
    else if (kind === 'inventory-type') await api.deleteInventoryType(id, requestId);
    else if (kind === 'link') await api.deleteLink(id, requestId);
    else if (kind === 'shift-preset') await api.deleteShiftPreset(id, requestId);
}

// Wires one row's edit/delete buttons. Called for every row on initial
// render, and again on a row after Cancel restores its read view (a fresh
// element only exists for `.settings-row-edit`/`-delete` at that point, so
// the listeners need re-attaching).
function wireSettingsRow(li: HTMLElement): void {
    const kind = li.dataset.kind;
    const page = kind ? SETTINGS_LIST_BY_KIND[kind] : undefined;
    const id = li.dataset.id;
    if (!page || !id) return;

    const editBtn = li.querySelector('.settings-row-edit') as HTMLButtonElement | null;
    const deleteBtn = li.querySelector('.settings-row-delete') as HTMLButtonElement | null;

    editBtn?.addEventListener('click', () => {
        const values = readRowValuesFromLi(li, page, id);
        li.innerHTML = renderSettingsRowEditInner(page, values);

        const form = li.querySelector('.settings-row-edit-form') as HTMLFormElement;
        const cancelBtn = li.querySelector('.settings-row-cancel') as HTMLButtonElement;

        cancelBtn.addEventListener('click', () => {
            li.innerHTML = renderSettingsRowViewInner(page, values);
            wireSettingsRow(li);
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = new FormData(form);
            const patch: Record<string, string> = {};
            page.fields.forEach((f) => {
                patch[f.field] = String(data.get(f.field) || '');
            });
            try {
                showSavingBadge(true);
                await updateSettingsRow(kind!, id, patch, generateRequestId());
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            } finally {
                showSavingBadge(false);
            }
        });
    });

    deleteBtn?.addEventListener('click', async () => {
        const label = li.getAttribute('data-raw-' + page.fields[0].field) || 'this item';
        if (!confirm(`Delete "${label}"? This can't be undone.`)) return;
        try {
            showSavingBadge(true);
            await deleteSettingsRow(kind!, id, generateRequestId());
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function wireSettingsListRows(): void {
    document
        .querySelectorAll('li[data-kind][data-id]')
        .forEach((li) => wireSettingsRow(li as HTMLElement));
}

// A page can embed more than one settings-form (Home content embeds both
// Quick links and Shift presets), so every match gets wired, not just the
// first.
function wireSettingsForm(): void {
    document.querySelectorAll('form.settings-form').forEach((formEl) => {
        const form = formEl as HTMLFormElement;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const kind = form.dataset.kind!;
            const data = new FormData(form);
            try {
                showSavingBadge(true);
                const requestId = generateRequestId();
                if (kind === 'department') {
                    await api.createDepartment(
                        {
                            name: String(data.get('Name')),
                            shortName: String(data.get('ShortName') || ''),
                            leadEmail: String(data.get('LeadEmail') || ''),
                        },
                        requestId,
                    );
                } else if (kind === 'place') {
                    await api.createPlace({ name: String(data.get('Name')) }, requestId);
                } else if (kind === 'inventory-type') {
                    await api.createInventoryType(
                        {
                            name: String(data.get('Name')),
                            description: String(data.get('Description') || ''),
                            requestable: true,
                            totalQuantity: Number(data.get('TotalQuantity') || 0),
                        },
                        requestId,
                    );
                } else if (kind === 'link') {
                    await api.createLink(
                        {
                            name: String(data.get('Name')),
                            url: String(data.get('Url')),
                            enabled: true,
                        },
                        requestId,
                    );
                } else if (kind === 'shift-preset') {
                    await api.createShiftPreset(
                        {
                            name: String(data.get('Name')),
                            defaultStartTime: String(data.get('DefaultStartTime') || ''),
                            defaultEndTime: String(data.get('DefaultEndTime') || ''),
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

function wireSettingsCreateModals(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-settings-modal-open]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const kind = btn.dataset.settingsModalOpen;
            const modal = kind
                ? (document.getElementById(settingsCreateModalId(kind)) as HTMLDialogElement | null)
                : null;
            modal?.showModal();
        });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-settings-modal-close]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const kind = btn.dataset.settingsModalClose;
            const modal = kind
                ? (document.getElementById(settingsCreateModalId(kind)) as HTMLDialogElement | null)
                : null;
            modal?.close();
        });
    });
}

// ---------------------------------------------------------------------------
// Others — the Home screen's message and guidelines, quick links and shift
// presets: everything that didn't earn a Settings page of its own.
// ---------------------------------------------------------------------------

export function renderHomeContent(container: HTMLElement, dashboard: DashboardPayload): void {
    container.innerHTML = `
    <section class="space-y-6">
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
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
                <div>
                  <label class="label" for="home-notification-email">Notification email</label>
                  <input id="home-notification-email" name="notificationEmail" type="email" class="input w-full" value="${escapeHtml(dashboard.homeContent.NotificationEmail)}" />
                </div>
              </div>
            </fieldset>
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
      </div>

      ${renderSettingsListCardsWithOptions(SETTINGS_LINKS_LIST, dashboard.links, true)}
      ${renderSettingsListCardsWithOptions(SETTINGS_SHIFT_PRESETS_LIST, dashboard.shiftPresets, true)}
    </section>
  `;

    wireHomeContentForm();
    wireSettingsForm();
    wireSettingsCreateModals();
    wireSettingsListRows();
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
                notificationEmail: String(data.get('notificationEmail') || ''),
            });
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}
