import { api } from '../api';
import { INVENTORY_REQUEST_QUERY_PARAM, WORKBENCH_MODE_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import {
    navigateToInventoryRequest,
    navigateToInventoryCreate,
    navigateToInventoryRequests,
    refreshDashboard,
} from '../router';
import {
    namePill,
    renderDetailCommandHeader,
    renderEmptyState,
    renderRequestActivityPanel,
    renderRequestDetailPage,
    renderRequestEditableField,
    renderRequestFieldGrid,
    renderRequestLineSection,
    renderRequestReadonlyFields,
    renderRequestRecordPanel,
    renderRequesterField,
    renderRequestTitleInput,
    renderWorkbenchHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml } from '../ui/format';
import { icon } from '../ui/icons';
import { INVENTORY_REQUEST_STATUS_ACCENT, INVENTORY_REQUEST_STATUS_BADGE } from '../ui/styles';
import { canApprove, canTransitionInventoryRequest, isRequestOverdue } from '../workflows';
import {
    type WorkbenchState,
    type WorkbenchToolbarConfig,
    readWorkbenchState,
    renderWorkbenchToolbar,
    wireWorkbenchToolbar,
    workItemHref,
} from '../workbench';

const INVENTORY_REQUEST_ACTION_LABELS: Record<InventoryRequestAction, string> = {
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    issue: 'Issue',
    return: 'Return',
    cancel: 'Cancel',
    close: 'Close',
};

const INVENTORY_REQUEST_VIEW_STORAGE_KEY = 'setu.inventory.requestView';

const INVENTORY_REQUEST_BOARD_COLUMNS: {
    id: string;
    title: string;
    description: string;
    statuses: InventoryRequestStatus[];
}[] = [
    {
        id: 'needs-review',
        title: 'Needs review',
        description: 'New requests waiting for a decision',
        statuses: ['draft', 'submitted'],
    },
    {
        id: 'approved',
        title: 'Approved',
        description: 'Ready to issue',
        statuses: ['approved'],
    },
    {
        id: 'issued',
        title: 'Issued',
        description: 'Equipment currently out',
        statuses: ['issued'],
    },
    {
        id: 'ready-to-close',
        title: 'Ready to close',
        description: 'Returned, rejected or cancelled',
        statuses: ['returned', 'rejected', 'cancelled'],
    },
    {
        id: 'closed',
        title: 'Closed',
        description: 'Completed request history',
        statuses: ['closed'],
    },
];

const ALL_INVENTORY_REQUEST_ACTIONS: InventoryRequestAction[] = [
    'submit',
    'approve',
    'reject',
    'issue',
    'return',
    'cancel',
    'close',
];

const INVENTORY_NEXT_STATUS_LABELS: Record<InventoryRequestStatus, string[]> = {
    draft: ['Submitted', 'Cancelled'],
    submitted: ['Approved', 'Rejected', 'Cancelled'],
    approved: ['Issued', 'Cancelled'],
    rejected: [],
    issued: [],
    returned: [],
    cancelled: [],
    closed: [],
};

const INVENTORY_STATUS_STEPS: { status: InventoryRequestStatus; label: string }[] = [
    { status: 'draft', label: 'Draft' },
    { status: 'submitted', label: 'Submit for Approval' },
    { status: 'approved', label: 'Approved' },
    { status: 'issued', label: 'Issued' },
    { status: 'rejected', label: 'Rejected' },
    { status: 'cancelled', label: 'Cancelled' },
];

function inventoryStatusSteps(
    status: InventoryRequestStatus,
    actions: InventoryRequestAction[] = [],
): { label: string; active: boolean; action?: InventoryRequestAction }[] {
    const targetActions: Partial<Record<InventoryRequestStatus, InventoryRequestAction>> = {
        submitted: 'submit',
        approved: 'approve',
        rejected: 'reject',
        issued: 'issue',
        cancelled: 'cancel',
    };
    return INVENTORY_STATUS_STEPS.map((step) => ({
        label: step.label,
        active: step.status === status,
        action: actions.includes(targetActions[step.status]!)
            ? targetActions[step.status]
            : undefined,
    }));
}

export async function renderInventory(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get(INVENTORY_REQUEST_QUERY_PARAM);
    if (requestId) {
        try {
            const request = await api.getInventoryRequest(requestId);
            const users = canApprove(dashboard.me) ? await api.listUsers() : [];
            renderInventoryRequestDetail(container, dashboard, request, users);
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('box', 'This request could not be opened.');
        }
        return;
    }
    if (params.get(WORKBENCH_MODE_QUERY_PARAM) === 'create') {
        const users = canApprove(dashboard.me) ? await api.listUsers() : [];
        renderInventoryCreate(container, dashboard, users);
        return;
    }
    renderInventoryWorkbench(container, dashboard);
}

function inventoryToolbarConfig(dashboard: DashboardPayload): WorkbenchToolbarConfig {
    void dashboard;
    return {
        storageKey: INVENTORY_REQUEST_VIEW_STORAGE_KEY,
        searchPlaceholder: 'Search requests, people or equipment',
        defaultSort: 'startDate',
        defaultDirection: 'asc',
    };
}

function renderInventoryWorkbench(container: HTMLElement, dashboard: DashboardPayload): void {
    const config = inventoryToolbarConfig(dashboard);
    const state = readWorkbenchState(config);
    container.innerHTML = `<section class="workbench-page m-3 h-[calc(100%-1.5rem)]">
      ${renderWorkbenchHeader('Inventory', `<button type="button" id="new-inventory-request" class="btn btn-primary btn-sm">New</button>`)}
      ${renderWorkbenchToolbar(config, state)}
      <div id="inventory-results" class="min-h-0" aria-live="polite"></div>
    </section>`;
    document
        .getElementById('new-inventory-request')!
        .addEventListener('click', navigateToInventoryCreate);
    wireWorkbenchToolbar(config, state, (next) => void loadInventoryResults(dashboard, next));
    void loadInventoryResults(dashboard, state);
}

function inventoryQuery(
    state: WorkbenchState,
    statuses?: InventoryRequestStatus[],
): InventoryRequestQuery {
    return {
        q: state.q,
        statuses,
        sortBy: state.sort as InventoryRequestQuery['sortBy'],
        sortDirection: state.direction,
    };
}

async function loadInventoryResults(
    dashboard: DashboardPayload,
    state: WorkbenchState,
): Promise<void> {
    const generation = ++inventoryResultsGeneration;
    const host = document.getElementById('inventory-results');
    if (!host) return;
    host.innerHTML =
        '<div class="workbench-loading"><span class="loading loading-spinner loading-sm"></span> Loading requests…</div>';
    try {
        await renderInventoryBoard(host, state, generation);
    } catch (err) {
        if (generation !== inventoryResultsGeneration) return;
        host.innerHTML =
            '<div class="alert alert-error">Inventory requests could not be loaded.</div>';
        showErrorAlert(err);
    }
}

let inventoryResultsGeneration = 0;

async function renderInventoryBoard(
    host: HTMLElement,
    state: WorkbenchState,
    generation: number,
): Promise<void> {
    const columns = INVENTORY_REQUEST_BOARD_COLUMNS;
    const results = await Promise.all(
        columns.map((column) =>
            api.listInventoryRequests(1, inventoryQuery(state, column.statuses)),
        ),
    );
    if (generation !== inventoryResultsGeneration || !host.isConnected) return;
    host.innerHTML = `<div class="workbench-board">${columns
        .map((column, index) => renderInventoryColumn(column, results[index], index))
        .join('')}</div>`;
    wireInventoryLinks(host);
    host.querySelectorAll<HTMLButtonElement>('[data-load-inventory-column]').forEach((button) => {
        button.addEventListener('click', async () => {
            const index = Number(button.dataset.loadInventoryColumn);
            const page = Number(button.dataset.nextPage);
            const result = await api.listInventoryRequests(
                page,
                inventoryQuery(state, columns[index].statuses),
            );
            button.insertAdjacentHTML(
                'beforebegin',
                result.items.map(renderInventoryRequestBoardCard).join(''),
            );
            wireInventoryLinks(button.closest('.workbench-column')!);
            if (page * result.pageSize >= result.totalCount) button.remove();
            else button.dataset.nextPage = String(page + 1);
        });
    });
}

function renderInventoryColumn(
    column: (typeof INVENTORY_REQUEST_BOARD_COLUMNS)[number],
    result: Paginated<InventoryRequestDTO>,
    index: number,
): string {
    return `<section class="workbench-column" aria-labelledby="inventory-column-${column.id}"><header class="workbench-column-heading"><div><h2 id="inventory-column-${column.id}">${escapeHtml(column.title)}</h2><p>${escapeHtml(column.description)}</p></div><span class="badge badge-ghost badge-sm">${result.totalCount}</span></header><div class="workbench-column-items">${result.items.length ? result.items.map(renderInventoryRequestBoardCard).join('') : '<div class="workbench-empty-column">No requests</div>'}</div>${result.items.length < result.totalCount ? `<button type="button" class="btn btn-ghost btn-sm w-full" data-load-inventory-column="${index}" data-next-page="2">Load more</button>` : ''}</section>`;
}

function wireInventoryLinks(root: ParentNode): void {
    root.querySelectorAll<HTMLAnchorElement>('a[data-inventory-id]').forEach((link) => {
        if (link.dataset.wired) return;
        link.dataset.wired = 'true';
        link.addEventListener('click', (event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigateToInventoryRequest(link.dataset.inventoryId!);
        });
    });
}

function renderInventoryCreate(
    container: HTMLElement,
    dashboard: DashboardPayload,
    users: UserDTO[] = [],
): void {
    const canEditRequester = canApprove(dashboard.me);
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-inventory',
        backLabel: 'Back to requests',
        eyebrow: 'Equipment request',
        reference: 'New',
        title: 'New equipment request',
        nextStatuses: INVENTORY_NEXT_STATUS_LABELS.draft,
        statusSteps: inventoryStatusSteps('draft'),
        topActionsHtml:
            '<button type="submit" form="create-request-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-inventory" class="btn btn-ghost btn-sm">Cancel</button>',
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: [
                renderRequesterField({
                    selectId: 'request-user',
                    users,
                    selectedEmail: dashboard.me.Email,
                    requesterName: dashboard.me.Name,
                    editable: true,
                    canEditRequester,
                }),
                renderRequestEditableField(
                    'From',
                    '<input id="request-start" name="startDate" type="date" class="input input-sm" required />',
                ),
                renderRequestEditableField(
                    'To',
                    '<input id="request-end" name="endDate" type="date" class="input input-sm" required />',
                ),
                renderRequestEditableField(
                    'Department',
                    renderRequestDepartmentSelect(
                        'request-department',
                        dashboard.departments,
                        dashboard.me.DepartmentId,
                    ),
                ),
                renderRequestEditableField(
                    'Lead email',
                    `<input id="request-lead-email" name="leadEmail" type="email" class="input input-sm" value="${escapeHtml(defaultLeadEmail(dashboard.departments, dashboard.me.DepartmentId))}" required />`,
                ),
                renderRequestEditableField(
                    'Participants',
                    '<input id="request-participants" name="participants" class="input input-sm" placeholder="email1, email2" />',
                ),
                renderRequestEditableField(
                    'Photo',
                    '<input id="request-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" class="file-input file-input-sm" />',
                ),
            ],
        },
    ]);
    const items = renderRequestLineSection(
        'Items',
        renderEditableInventoryItemsShell(),
        'Add at least one equipment item before saving.',
        renderAddItemButton(),
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        `${renderRequestRecordPanel(
            `${renderRequestTitleInput('request-name', 'name', 'Request name')}${renderRequestRecordTwoPane(fields, items)}`,
            'form',
            'id="create-request-form"',
        )}${renderInventoryItemModal()}`,
        renderRequestActivityPanel({ createMode: true }),
        false,
    );
    document
        .getElementById('back-to-inventory')!
        .addEventListener('click', navigateToInventoryRequests);
    document
        .getElementById('cancel-inventory')!
        .addEventListener('click', navigateToInventoryRequests);
    wireDepartmentLeadPrefill(dashboard.departments, 'request-department', 'request-lead-email');
    wireInventoryTypePicker(dashboard);
    wireCreateRequestForm();
}

function renderInventoryRequestDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    request: InventoryRequestDTO,
    users: UserDTO[] = [],
): void {
    const actions = availableInventoryRequestActions(request, dashboard);
    const overdue = isRequestOverdue(request);
    const editable = canEditInventoryRequest(request, dashboard);
    const canEditRequester = canApprove(dashboard.me);
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-inventory-requests',
        backLabel: 'Back to requests',
        eyebrow: 'Equipment request',
        reference: `REQ-${request.DisplayId}`,
        title: request.Name,
        nextStatuses: INVENTORY_NEXT_STATUS_LABELS[request.Status],
        statusSteps: inventoryStatusSteps(request.Status, actions),
        topActionsHtml: editable
            ? '<div id="inventory-edit-actions" class="hidden"><button type="submit" form="edit-inventory-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-inventory-edits" class="btn btn-ghost btn-sm">Cancel</button></div>'
            : '',
    });
    const detailRows = editable
        ? [
              renderRequesterField({
                  selectId: 'request-user',
                  users,
                  selectedEmail: request.UserId,
                  requesterName: request.userName,
                  editable: true,
                  canEditRequester,
              }),
              renderRequestEditableField(
                  'From',
                  `<input id="request-start" name="startDate" type="date" class="input input-sm" value="${escapeHtml(request.StartDate)}" required />`,
              ),
              renderRequestEditableField(
                  'To',
                  `<input id="request-end" name="endDate" type="date" class="input input-sm" value="${escapeHtml(request.EndDate)}" required />`,
              ),
              renderRequestEditableField(
                  'Department',
                  renderRequestDepartmentSelect(
                      'request-department',
                      dashboard.departments,
                      request.DepartmentId,
                  ),
              ),
              renderRequestEditableField(
                  'Lead email',
                  `<input id="request-lead-email" name="leadEmail" type="email" class="input input-sm" value="${escapeHtml(request.LeadEmail)}" required />`,
              ),
              renderRequestEditableField(
                  'Participants',
                  `<input id="request-participants" name="participants" class="input input-sm" value="${escapeHtml(request.participants.join(', '))}" />`,
              ),
          ]
        : [
              renderRequestReadonlyFields([
                  { label: 'Requested by', valueHtml: escapeHtml(request.userName) },
                  {
                      label: 'Equipment period',
                      valueHtml: `${escapeHtml(request.StartDate)} to ${escapeHtml(request.EndDate)}`,
                  },
                  {
                      label: 'Department',
                      valueHtml: escapeHtml(request.departmentName),
                  },
                  { label: 'Lead email', valueHtml: escapeHtml(request.LeadEmail) },
                  {
                      label: 'Participants',
                      valueHtml:
                          request.participants.length > 0
                              ? request.participants.map(namePill).join('')
                              : '<span class="text-base-content/60">No additional participants</span>',
                  },
                  { label: 'Overdue', valueHtml: overdue ? 'Yes' : 'No' },
              ]),
          ];
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: detailRows,
        },
    ]);
    const equipment = renderRequestLineSection(
        'Equipment',
        editable
            ? renderEditableInventoryItemsShell()
            : `<div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Item</th><th class="text-right">Quantity</th><th>Return condition</th></tr></thead><tbody>${request.items
                  .map(
                      (item) =>
                          `<tr><td class="font-medium">${escapeHtml(item.itemName)}</td><td class="text-right">${item.Quantity}</td><td>${renderInventoryConditionLabel(item.Condition)}</td></tr>`,
                  )
                  .join('')}</tbody></table></div>`,
        '',
        editable ? renderAddItemButton() : '',
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        `${renderRequestRecordPanel(
            `${editable ? renderRequestTitleInput('request-name', 'name', 'Request name') : ''}${renderRequestRecordTwoPane(fields, equipment)}${renderDetailRequestImages(request)}`,
            editable ? 'form' : 'main',
            editable
                ? 'id="edit-inventory-form"'
                : `id="inventory-request-detail" data-request-id="${escapeHtml(request.Id)}"`,
        )}${editable ? renderInventoryItemModal() : ''}`,
        renderRequestActivityPanel({
            comments: request.comments,
            commentFormId: 'request-comment-form',
        }),
        false,
    );
    document
        .getElementById('back-to-inventory-requests')!
        .addEventListener('click', navigateToInventoryRequests);
    if (editable) wireInventoryDetailEditForm(container, dashboard, request, users);
    wireInventoryRequestDetail(request);
}

function renderDetailRequestImages(request: InventoryRequestDTO): string {
    if (!request.ImageId) return '';
    return `<div class="card border border-base-300 bg-base-100 shadow"><div class="card-body gap-3"><h2 class="card-title text-base">Photo</h2><img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(request.ImageId)}" class="aspect-square w-full max-w-64 rounded-box border border-base-300 object-cover" alt="Request photo" /></div></div>`;
}

function availableInventoryRequestActions(
    request: InventoryRequestDTO,
    dashboard: DashboardPayload,
): InventoryRequestAction[] {
    const isOwner =
        request.UserId === dashboard.me.Email ||
        request.participants.indexOf(dashboard.me.Email) !== -1;
    const isApprover = canApprove(dashboard.me);
    return ALL_INVENTORY_REQUEST_ACTIONS.filter((action) => {
        if (!canTransitionInventoryRequest(request.Status, action)) return false;
        return action === 'submit' ? isOwner : isApprover;
    });
}

function canEditInventoryRequest(
    request: InventoryRequestDTO,
    dashboard: DashboardPayload,
): boolean {
    const owner =
        request.UserId === dashboard.me.Email ||
        request.participants.indexOf(dashboard.me.Email) !== -1;
    return canApprove(dashboard.me) || (owner && request.Status === 'draft');
}

function wireInventoryDetailEditForm(
    container: HTMLElement,
    dashboard: DashboardPayload,
    request: InventoryRequestDTO,
    users: UserDTO[] = [],
): void {
    const form = document.getElementById('edit-inventory-form') as HTMLFormElement;
    const title = document.getElementById('request-name') as HTMLInputElement;
    title.value = request.Name;
    wireDepartmentLeadPrefill(dashboard.departments, 'request-department', 'request-lead-email');
    const list = document.getElementById('request-items')!;
    const actions = document.getElementById('inventory-edit-actions')!;
    const readSnapshot = () => JSON.stringify(readInventoryFormInput(form));
    let savedSnapshot = '';
    const updateDirty = () => actions.classList.toggle('hidden', readSnapshot() === savedSnapshot);
    wireInventoryItemModal(list, dashboard, updateDirty);
    request.items.forEach((item) => addInventoryItemRow(list, dashboard, updateDirty, item));
    savedSnapshot = readSnapshot();
    updateDirty();
    document
        .getElementById('add-request-item')!
        .addEventListener('click', () =>
            openInventoryItemModal(list, dashboard, undefined, updateDirty),
        );
    form.addEventListener('input', updateDirty);
    form.addEventListener('change', updateDirty);
    document.getElementById('cancel-inventory-edits')!.addEventListener('click', () => {
        renderInventoryRequestDetail(container, dashboard, request, users);
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = readInventoryFormInput(form);
        if (input.items.length === 0) {
            showErrorAlert(new Error('Add at least one item.'));
            return;
        }
        try {
            showSavingBadge(true);
            await api.updateInventoryRequest(request.Id, input, generateRequestId());
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function wireInventoryRequestDetail(request: InventoryRequestDTO): void {
    document.querySelectorAll<HTMLButtonElement>('button[data-detail-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            await handleInventoryRequestAction(
                request,
                button.dataset.detailAction as InventoryRequestAction,
            );
        });
    });
    const commentForm = document.getElementById('request-comment-form') as HTMLFormElement;
    commentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = commentForm.querySelector('input[name="message"]') as HTMLInputElement;
        const message = input.value.trim();
        if (!message) return;
        try {
            showSavingBadge(true);
            await api.addComment(request.Id, message, generateRequestId());
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function wireInventoryTypePicker(dashboard: DashboardPayload): void {
    const list = document.getElementById('request-items')!;
    const addButton = document.getElementById('add-request-item')!;

    wireInventoryItemModal(list, dashboard);
    const addRow = () => openInventoryItemModal(list, dashboard);
    addButton.addEventListener('click', addRow);
}

function renderAddItemButton(): string {
    return `<button type="button" id="add-request-item" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add item</button>`;
}

function renderRequestRecordTwoPane(fieldsHtml: string, linesHtml: string): string {
    return `<div class="request-record-two-pane">${fieldsHtml}${linesHtml}</div>`;
}

function renderEditableInventoryItemsShell(): string {
    return '<div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Item</th><th class="text-right">Quantity</th><th>Return condition</th><th class="w-20"></th></tr></thead><tbody id="request-items"></tbody></table></div>';
}

function renderInventoryItemModal(): string {
    return `<dialog id="inventory-item-modal" class="modal">
      <div class="modal-box w-11/12 max-w-[42rem]">
        <h3 class="mb-4 text-base font-semibold">Equipment item</h3>
        <form id="inventory-item-modal-form" class="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="rowIndex" />
          <label class="fieldset"><span class="label">Item</span><select name="inventoryTypeId" class="select w-full" required></select></label>
          <label class="fieldset"><span class="label">Quantity</span><input name="quantity" type="number" min="1" class="input w-full" required /></label>
          <label class="fieldset"><span class="label">Return condition</span><select name="condition" class="select w-full">${renderInventoryConditionOptions()}</select></label>
          <div class="modal-action sm:col-span-2"><button type="button" class="btn btn-ghost" id="cancel-inventory-item-modal">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>`;
}

function renderInventoryConditionOptions(selected: ReturnCondition | '' = ''): string {
    const options: { value: ReturnCondition | ''; label: string }[] = [
        { value: '', label: 'Not returned' },
        { value: 'good', label: 'Returned' },
        { value: 'damaged', label: 'Damaged' },
        { value: 'missing', label: 'Lost' },
    ];
    return options
        .map(
            (option) =>
                `<option value="${option.value}" ${option.value === selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`,
        )
        .join('');
}

function renderInventoryConditionLabel(condition: ReturnCondition | ''): string {
    if (condition === 'good') return 'Returned';
    if (condition === 'damaged') return 'Damaged';
    if (condition === 'missing') return 'Lost';
    return '<span class="text-base-content/50">Not returned</span>';
}

function addInventoryItemRow(
    list: HTMLElement,
    dashboard: DashboardPayload,
    onChange?: () => void,
    item?: InventoryItemDTO,
): void {
    const selectedId = item?.InventoryTypeId || dashboard.inventoryTypes[0]?.Id || '';
    const row = document.createElement('tr');
    row.className = 'request-item-row';
    setInventoryItemRow(row, dashboard, {
        inventoryTypeId: selectedId,
        quantity: item?.Quantity || 1,
        condition: item?.Condition || '',
    });
    wireInventoryItemRow(row, list, dashboard, onChange);
    list.appendChild(row);
    onChange?.();
}

function setInventoryItemRow(
    row: HTMLElement,
    dashboard: DashboardPayload,
    item: InventoryItemInput,
): void {
    const type = dashboard.inventoryTypes.find(
        (inventoryType) => inventoryType.Id === item.inventoryTypeId,
    );
    row.innerHTML = `
      <td>${escapeHtml(type ? type.Name : 'Select item')}<input type="hidden" name="inventoryTypeId" value="${escapeHtml(item.inventoryTypeId)}" /></td>
      <td class="text-right">${item.quantity}<input type="hidden" name="quantity" value="${escapeHtml(String(item.quantity))}" /></td>
      <td>${renderInventoryConditionLabel(item.condition || '')}<input type="hidden" name="condition" value="${escapeHtml(item.condition || '')}" /></td>
      <td><span class="request-row-actions"><button type="button" class="btn btn-ghost btn-xs" data-item-edit aria-label="Edit item">${icon('edit', 'size-4')}</button><button type="button" class="btn btn-ghost btn-xs text-error" data-item-delete aria-label="Delete item">${icon('trash', 'size-4')}</button></span></td>`;
}

function wireInventoryItemRow(
    row: HTMLElement,
    list: HTMLElement,
    dashboard: DashboardPayload,
    onChange?: () => void,
): void {
    row.querySelector<HTMLButtonElement>('[data-item-edit]')!.addEventListener('click', () =>
        openInventoryItemModal(list, dashboard, row, onChange),
    );
    row.querySelector<HTMLButtonElement>('[data-item-delete]')!.addEventListener('click', () => {
        row.remove();
        onChange?.();
    });
}

function wireInventoryItemModal(
    list: HTMLElement,
    dashboard: DashboardPayload,
    onChange?: () => void,
): void {
    const modal = document.getElementById('inventory-item-modal') as HTMLDialogElement;
    const form = document.getElementById('inventory-item-modal-form') as HTMLFormElement;
    const select = form.elements.namedItem('inventoryTypeId') as HTMLSelectElement;
    select.innerHTML = [...dashboard.inventoryTypes]
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map(
            (type) =>
                `<option value="${escapeHtml(type.Id)}">${escapeHtml(type.Name)} (${type.availableQuantity} available)</option>`,
        )
        .join('');
    document
        .getElementById('cancel-inventory-item-modal')!
        .addEventListener('click', () => modal.close());
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const item = readInventoryItemModal(form);
        if (!item.inventoryTypeId || !(item.quantity > 0)) {
            showErrorAlert(new Error('Select an item and quantity.'));
            return;
        }
        const index = Number((form.elements.namedItem('rowIndex') as HTMLInputElement).value);
        const rows = Array.from(list.querySelectorAll<HTMLElement>('.request-item-row'));
        const row = rows[index] || document.createElement('tr');
        row.className = 'request-item-row';
        setInventoryItemRow(row, dashboard, item);
        wireInventoryItemRow(row, list, dashboard, onChange);
        if (!rows[index]) list.appendChild(row);
        modal.close();
        onChange?.();
    });
}

function openInventoryItemModal(
    list: HTMLElement,
    dashboard: DashboardPayload,
    row?: HTMLElement,
    onChange?: () => void,
): void {
    void dashboard;
    void onChange;
    const modal = document.getElementById('inventory-item-modal') as HTMLDialogElement;
    const form = document.getElementById('inventory-item-modal-form') as HTMLFormElement;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.request-item-row'));
    const item = row
        ? readInventoryItemRow(row)
        : {
              inventoryTypeId: (form.elements.namedItem('inventoryTypeId') as HTMLSelectElement)
                  .value,
              quantity: 1,
              condition: '',
          };
    (form.elements.namedItem('rowIndex') as HTMLInputElement).value = row
        ? String(rows.indexOf(row))
        : '-1';
    (form.elements.namedItem('inventoryTypeId') as HTMLSelectElement).value = item.inventoryTypeId;
    (form.elements.namedItem('quantity') as HTMLInputElement).value = String(item.quantity);
    (form.elements.namedItem('condition') as HTMLSelectElement).value = item.condition || '';
    modal.showModal();
}

function readInventoryItemRow(row: HTMLElement): InventoryItemInput {
    return {
        inventoryTypeId: (row.querySelector('[name="inventoryTypeId"]') as HTMLInputElement).value,
        quantity: Number((row.querySelector('[name="quantity"]') as HTMLInputElement).value),
        condition: (row.querySelector('[name="condition"]') as HTMLInputElement).value as
            ReturnCondition | '',
    };
}

function readInventoryItemModal(form: HTMLFormElement): InventoryItemInput {
    return {
        inventoryTypeId: (form.elements.namedItem('inventoryTypeId') as HTMLSelectElement).value,
        quantity: Number((form.elements.namedItem('quantity') as HTMLInputElement).value),
        condition: (form.elements.namedItem('condition') as HTMLSelectElement).value as
            ReturnCondition | '',
    };
}

function readInventoryFormInput(form: HTMLFormElement): UpdateInventoryRequestInput {
    const data = new FormData(form);
    return {
        name: String(data.get('name')),
        userId: String(data.get('userId')),
        startDate: String(data.get('startDate')),
        endDate: String(data.get('endDate')),
        departmentId: String(data.get('departmentId')),
        leadEmail: String(data.get('leadEmail')),
        participants: String(data.get('participants') || ''),
        items: Array.from(form.querySelectorAll('.request-item-row')).map((row) => {
            const inventoryTypeId = (
                row.querySelector('[name="inventoryTypeId"]') as HTMLInputElement
            ).value;
            const quantity = Number(
                (row.querySelector('[name="quantity"]') as HTMLInputElement).value,
            );
            const condition = (row.querySelector('[name="condition"]') as HTMLInputElement)
                .value as ReturnCondition | '';
            return { inventoryTypeId, quantity, condition };
        }),
    };
}

function renderRequestDepartmentSelect(
    id: string,
    departments: Department[],
    selectedId: string,
): string {
    return `<select id="${id}" name="departmentId" class="select select-sm" required><option value="">Select department</option>${[
        ...departments,
    ]
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map(
            (department) =>
                `<option value="${department.Id}" ${department.Id === selectedId ? 'selected' : ''}>${escapeHtml(department.Name)}</option>`,
        )
        .join('')}</select>`;
}

function defaultLeadEmail(departments: Department[], departmentId: string): string {
    return departments.find((department) => department.Id === departmentId)?.LeadEmail || '';
}

function wireDepartmentLeadPrefill(
    departments: Department[],
    departmentSelectId: string,
    leadEmailId: string,
): void {
    const departmentSelect = document.getElementById(
        departmentSelectId,
    ) as HTMLSelectElement | null;
    const leadEmail = document.getElementById(leadEmailId) as HTMLInputElement | null;
    if (!departmentSelect || !leadEmail) return;
    departmentSelect.addEventListener('change', () => {
        leadEmail.value = defaultLeadEmail(departments, departmentSelect.value);
        leadEmail.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result);
            const commaIndex = dataUrl.indexOf(',');
            resolve(commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function wireCreateRequestForm(): void {
    const form = document.getElementById('create-request-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const items = Array.from(form.querySelectorAll('.request-item-row')).map((row) => {
            const inventoryTypeId = (
                row.querySelector('[name="inventoryTypeId"]') as HTMLInputElement
            ).value;
            const quantity = Number(
                (row.querySelector('[name="quantity"]') as HTMLInputElement).value,
            );
            const condition = (row.querySelector('[name="condition"]') as HTMLInputElement)
                .value as ReturnCondition | '';
            return { inventoryTypeId, quantity, condition };
        });
        if (items.length === 0) {
            showErrorAlert(new Error('Add at least one item.'));
            return;
        }
        try {
            showSavingBadge(true);
            const fileInput = document.getElementById('request-image') as HTMLInputElement;
            let imageId = '';
            const file = fileInput.files?.[0];
            if (file) {
                const base64 = await readFileAsBase64(file);
                imageId = await api.uploadImage(base64, file.name, file.type);
            }
            const created = await api.createInventoryRequest(
                {
                    name: String(data.get('name')),
                    userId: String(data.get('userId')),
                    startDate: String(data.get('startDate')),
                    endDate: String(data.get('endDate')),
                    items,
                    imageId,
                    departmentId: String(data.get('departmentId')),
                    leadEmail: String(data.get('leadEmail')),
                    participants: String(data.get('participants') || ''),
                },
                generateRequestId(),
            );
            navigateToInventoryRequest(created.Id);
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function renderInventoryRequestBoardCard(request: InventoryRequestDTO): string {
    const overdue = isRequestOverdue(request);
    const items = request.items
        .map((item) => `${escapeHtml(item.itemName)} × ${item.Quantity}`)
        .join(' · ');
    return `
      <a class="workbench-card border-l-4 ${INVENTORY_REQUEST_STATUS_ACCENT[request.Status]}" href="${workItemHref(INVENTORY_REQUEST_QUERY_PARAM, request.Id)}" data-inventory-id="${request.Id}" aria-label="Open REQ-${request.DisplayId} ${escapeHtml(request.Name)}">
        <div class="workbench-card-top">
          <span class="font-mono text-xs text-base-content/50">REQ-${request.DisplayId}</span>
          <span class="badge badge-xs ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span>
        </div>
        <h4 class="mt-1.5 line-clamp-2 font-medium leading-snug">${escapeHtml(request.Name)}</h4>
        <p class="mt-1 text-xs text-base-content/55">${escapeHtml(request.userName)}</p>
        <p class="mt-2 text-xs text-base-content/65">${escapeHtml(request.StartDate)} → ${escapeHtml(request.EndDate)}</p>
        ${items ? `<p class="mt-2 line-clamp-2 text-sm text-base-content/75">${items}</p>` : ''}
        ${overdue ? '<div class="mt-3"><span class="badge badge-error badge-sm">Overdue</span></div>' : ''}
      </a>`;
}

async function handleInventoryRequestAction(
    request: InventoryRequestDTO,
    action: InventoryRequestAction,
): Promise<void> {
    if (
        !window.confirm(
            `Change this equipment request status: ${INVENTORY_REQUEST_ACTION_LABELS[action]}?`,
        )
    ) {
        return;
    }
    let note = '';
    if (action === 'reject' || action === 'cancel') {
        note = window.prompt('Add a note (required, at least 3 characters):') || '';
        if (note.trim().length < 3) return;
    }

    let returnItems: ReturnItemInput[] | null = null;
    if (action === 'return') {
        returnItems = [];
        for (const item of request.items) {
            const condition = window.prompt(
                `Condition for ${item.itemName}: good, damaged, or missing`,
                'good',
            );
            if (!condition) return;
            returnItems.push({ condition: condition as ReturnCondition });
        }
    }

    try {
        showSavingBadge(true);
        await api.performInventoryRequestAction(
            request.Id,
            action,
            note,
            returnItems,
            generateRequestId(),
        );
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}
