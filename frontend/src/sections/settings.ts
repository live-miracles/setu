import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
import { renderEmptyState, renderSectionHeader } from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml } from '../ui/format';
import type { IconName } from '../ui/icons';
import { icon } from '../ui/icons';
import {
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

export async function renderUsers(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const isAdmin = canManageConfig(dashboard.me);
    const users = await api.listUsers();

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader(
          'user',
          'Users',
          isAdmin ? 'Who has access, and what each of them can do.' : 'Everyone with access.',
      )}

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base">${users.length} ${users.length === 1 ? 'person' : 'people'}</h2>
            <span class="text-xs text-base-content/50">from your Google domain</span>
          </div>
          <p class="text-sm text-base-content/60">People self-register automatically the first time they sign in from your organisation's Google domain — there is no invite step. ${
              isAdmin ? "Set someone's role here." : "Only an admin can change someone's role."
          }</p>
          <ul id="user-list" class="divide-y divide-base-200"></ul>
          ${isAdmin ? renderRoleLegend() : ''}
        </div>
      </div>
    </section>
  `;

    renderUserList(users, dashboard, isAdmin);
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

// `editable` is false for approvers, who see the same list as a plain
// roster of who has access. Your own row stays locked either way — the
// backend refuses self-demotion (see updateUser in Admin.ts).
function renderUserList(users: UserDTO[], dashboard: DashboardPayload, editable: boolean): void {
    const list = document.getElementById('user-list');
    if (!list) return;
    list.innerHTML = users
        .map(
            (u) => `
        <li class="flex flex-wrap items-center justify-between gap-3 py-2.5" data-user-id="${u.Email}">
          <div class="min-w-0">
            <div class="font-medium">${escapeHtml(u.Name)} <span class="text-sm font-normal opacity-60">${escapeHtml(u.Email)}</span></div>
            <div class="text-sm text-base-content/60">${escapeHtml(u.departmentName || 'No department')}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            ${
                editable
                    ? `<select class="select select-sm role-select" ${u.Email === dashboard.me.Email ? 'disabled' : ''} aria-label="Role for ${escapeHtml(u.Name)}">
              ${USER_ROLE_ORDER.map(
                  (role) =>
                      `<option value="${role}" ${u.Role === role ? 'selected' : ''}>${escapeHtml(USER_ROLE_LABELS[role])}</option>`,
              ).join('')}
            </select>`
                    : `<span class="badge badge-soft badge-sm ${roleBadgeClass(u.Role)}">${escapeHtml(roleLabel(u.Role))}</span>`
            }
          </div>
        </li>`,
        )
        .join('');

    if (!editable) return;

    list.querySelectorAll('li[data-user-id]').forEach((li) => {
        const userId = (li as HTMLElement).dataset.userId!;
        const roleSelect = li.querySelector('.role-select') as HTMLSelectElement;

        roleSelect.addEventListener('change', async () => {
            try {
                showSavingBadge(true);
                await api.updateUser(userId, { role: roleSelect.value as UserRole });
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            } finally {
                showSavingBadge(false);
            }
        });
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
    fields: { field: string; label: string }[];
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

export function renderSettingsList(
    page: SettingsListPage,
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader(page.iconName, page.title, page.subtitle)}
      ${renderSettingsListCards(page, page.rows(dashboard))}
    </section>
  `;

    wireSettingsForm();
}

// The add-form and list cards on their own, so Home content can embed the
// Quick links pair below its own form instead of owning a whole page.
function renderSettingsListCards(page: SettingsList, rows: Record<string, any>[]): string {
    return `
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} ${escapeHtml(page.addLabel)}</h2>
          <form class="settings-form flex flex-wrap items-end gap-2" data-kind="${page.kind}">
            ${page.fields
                .map(
                    (f, i) => `
              <div class="flex-1" style="min-width: 10rem;">
                <label class="label text-xs">${escapeHtml(f.label)}</label>
                <input name="${f.field}" class="input input-sm w-full" ${i === 0 ? 'required' : ''} />
              </div>`,
                )
                .join('')}
            <button type="submit" class="btn btn-sm btn-primary">Add</button>
          </form>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base">${escapeHtml(page.title)}</h2>
            <span class="badge badge-ghost badge-sm">${rows.length}</span>
          </div>
          ${
              rows.length === 0
                  ? renderEmptyState(page.iconName, page.emptyMessage)
                  : `<ul class="divide-y divide-base-200">${rows
                        .map(
                            (r) => `
                    <li class="flex flex-wrap items-baseline gap-x-2 py-2 text-sm">
                      <span class="font-medium">${escapeHtml(r[page.fields[0].field] ?? '')}</span>
                      ${page.fields
                          .slice(1)
                          .map(
                              (f) =>
                                  `<span class="text-base-content/60">${escapeHtml(r[f.field] ?? '')}</span>`,
                          )
                          .join('')}
                    </li>`,
                        )
                        .join('')}</ul>`
          }
        </div>
      </div>`;
}

function wireSettingsForm(): void {
    const form = document.querySelector('form.settings-form') as HTMLFormElement | null;
    if (!form) return;
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
            }
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

// ---------------------------------------------------------------------------
// Home content — the message and guidelines, plus the quick links, since
// everything on this page is something the Home screen renders.
// ---------------------------------------------------------------------------

export function renderHomeContent(container: HTMLElement, dashboard: DashboardPayload): void {
    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('home', 'Home content', 'The message, guidelines and links shown on Home.')}

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
              </div>
            </fieldset>
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
      </div>

      ${renderSettingsListCards(SETTINGS_LINKS_LIST, dashboard.links)}
    </section>
  `;

    wireHomeContentForm();
    wireSettingsForm();
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
