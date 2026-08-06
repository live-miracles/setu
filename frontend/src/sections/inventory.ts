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
    renderRequestDisplayTitle,
    renderRequestEditableField,
    renderRequestFieldGrid,
    renderRequestLineSection,
    renderRequestReadonlyFields,
    renderRequestRecordPanel,
    renderRequestTitleInput,
    renderWorkbenchHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml } from '../ui/format';
import { icon } from '../ui/icons';
import {
    INVENTORY_REQUEST_ACTION_BTN,
    INVENTORY_REQUEST_STATUS_ACCENT,
    INVENTORY_REQUEST_STATUS_BADGE,
} from '../ui/styles';
import { canApprove, canTransitionInventoryRequest, isRequestOverdue } from '../workflows';
import {
    type WorkbenchState,
    type WorkbenchToolbarConfig,
    readWorkbenchState,
    renderWorkbenchToolbar,
    wireSortableHeaders,
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
    rejected: ['Closed'],
    issued: ['Returned'],
    returned: ['Closed'],
    cancelled: ['Closed'],
    closed: [],
};

const INVENTORY_STATUS_STEPS: { status: InventoryRequestStatus; label: string }[] = [
    { status: 'draft', label: 'Draft' },
    { status: 'submitted', label: 'Submit for Approval' },
    { status: 'approved', label: 'Approved' },
    { status: 'issued', label: 'Issued' },
    { status: 'returned', label: 'Returned' },
    { status: 'closed', label: 'Closed' },
    { status: 'rejected', label: 'Rejected' },
    { status: 'cancelled', label: 'Cancelled' },
];

function inventoryStatusSteps(
    status: InventoryRequestStatus,
): { label: string; active: boolean }[] {
    return INVENTORY_STATUS_STEPS.map((step) => ({
        label: step.label,
        active: step.status === status,
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
            renderInventoryRequestDetail(
                container,
                dashboard,
                await api.getInventoryRequest(requestId),
            );
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('box', 'This request could not be opened.');
        }
        return;
    }
    if (params.get(WORKBENCH_MODE_QUERY_PARAM) === 'create') {
        renderInventoryCreate(container, dashboard);
        return;
    }
    renderInventoryWorkbench(container, dashboard);
}

function inventoryToolbarConfig(dashboard: DashboardPayload): WorkbenchToolbarConfig {
    return {
        storageKey: INVENTORY_REQUEST_VIEW_STORAGE_KEY,
        searchPlaceholder: 'Search requests, people or equipment',
        statuses: [
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Needs review' },
            { value: 'approved', label: 'Approved' },
            { value: 'issued', label: 'Issued' },
            { value: 'returned', label: 'Returned' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'closed', label: 'Closed' },
        ],
        defaultSort: 'id',
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
        statuses: state.status ? [state.status as InventoryRequestStatus] : statuses,
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
        if (state.view === 'board') await renderInventoryBoard(host, state, generation);
        else await renderInventoryList(host, dashboard, state, generation);
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
    const columns = INVENTORY_REQUEST_BOARD_COLUMNS.filter(
        (column) =>
            !state.status || column.statuses.includes(state.status as InventoryRequestStatus),
    );
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

async function renderInventoryList(
    host: HTMLElement,
    dashboard: DashboardPayload,
    state: WorkbenchState,
    generation: number,
): Promise<void> {
    const result = await api.listInventoryRequests(1, inventoryQuery(state));
    if (generation !== inventoryResultsGeneration || !host.isConnected) return;
    host.innerHTML = `<div class="workbench-table-wrap"><table class="workbench-table"><thead><tr>${inventorySortHeader('Request', 'name', state)}<th>Equipment</th>${inventorySortHeader('Dates', 'startDate', state)}${inventorySortHeader('Requested by', 'requester', state)}${inventorySortHeader('Status', 'status', state)}</tr></thead><tbody id="inventory-list-body">${result.items.map(renderInventoryListRow).join('')}</tbody></table>${result.items.length === 0 ? renderEmptyState('box', 'No requests match these filters.') : ''}${result.items.length < result.totalCount ? `<button type="button" id="load-more-inventory" class="btn btn-ghost btn-sm mt-3">Load more (${result.totalCount - result.items.length})</button>` : ''}</div>`;
    wireInventoryLinks(host);
    wireSortableHeaders(state, (next) => void loadInventoryResults(dashboard, next));
    document.getElementById('load-more-inventory')?.addEventListener('click', async (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const page = Number(button.dataset.page || '2');
        const next = await api.listInventoryRequests(page, inventoryQuery(state));
        document
            .getElementById('inventory-list-body')!
            .insertAdjacentHTML('beforeend', next.items.map(renderInventoryListRow).join(''));
        wireInventoryLinks(host);
        if (page * next.pageSize >= next.totalCount) button.remove();
        else button.dataset.page = String(page + 1);
    });
}

function inventorySortHeader(label: string, sort: string, state: WorkbenchState): string {
    const marker = state.sort === sort ? (state.direction === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th><button type="button" data-workbench-sort="${sort}">${label}${marker}</button></th>`;
}

function renderInventoryListRow(request: InventoryRequestDTO): string {
    const overdue = isRequestOverdue(request);
    return `<tr><td data-label="Request"><a href="${workItemHref(INVENTORY_REQUEST_QUERY_PARAM, request.Id)}" data-inventory-id="${request.Id}"><span class="font-mono text-xs">REQ-${request.DisplayId}</span><strong>${escapeHtml(request.Name)}</strong></a></td><td data-label="Equipment">${request.items.map((item) => `${escapeHtml(item.itemName)} × ${item.Quantity}`).join('<br />')}</td><td data-label="Dates">${escapeHtml(request.StartDate)} → ${escapeHtml(request.EndDate)}${overdue ? '<small><span class="badge badge-error badge-xs">Overdue</span></small>' : ''}</td><td data-label="Requested by">${escapeHtml(request.userName)}</td><td data-label="Status"><span class="badge badge-sm ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span></td></tr>`;
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

function renderInventoryCreate(container: HTMLElement, dashboard: DashboardPayload): void {
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-inventory',
        backLabel: 'Back to requests',
        eyebrow: 'Equipment request',
        reference: 'New',
        title: 'New equipment request',
        statusHtml: '<span class="badge badge-ghost">draft</span>',
        nextStatuses: INVENTORY_NEXT_STATUS_LABELS.draft,
        statusSteps: inventoryStatusSteps('draft'),
        actionsHtml:
            '<button type="submit" form="create-request-form" class="btn btn-primary btn-sm">Save</button><button type="button" id="cancel-inventory" class="btn btn-ghost btn-sm">Cancel</button>',
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: [
                renderRequestEditableField(
                    'From',
                    '<input id="request-start" name="startDate" type="date" class="input input-sm" required />',
                ),
                renderRequestEditableField(
                    'To',
                    '<input id="request-end" name="endDate" type="date" class="input input-sm" required />',
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
        {
            title: 'Requester info',
            rows: [
                renderRequestReadonlyFields([
                    { label: 'Requester', valueHtml: escapeHtml(dashboard.me.Name) },
                    {
                        label: 'Department',
                        valueHtml: escapeHtml(dashboard.me.departmentName || ''),
                    },
                    { label: 'Email', valueHtml: escapeHtml(dashboard.me.Email) },
                ]),
            ],
        },
    ]);
    const items = renderRequestLineSection(
        'Items',
        `<div id="request-items" class="request-line-list"></div><button type="button" id="add-request-item" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add item</button>`,
        'Add at least one equipment item before saving.',
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        renderRequestRecordPanel(
            `${renderRequestTitleInput('request-name', 'name', 'Request name')}${fields}${items}`,
            'form',
            'id="create-request-form"',
        ),
        renderRequestActivityPanel({ createMode: true }),
        true,
    );
    document
        .getElementById('back-to-inventory')!
        .addEventListener('click', navigateToInventoryRequests);
    document
        .getElementById('cancel-inventory')!
        .addEventListener('click', navigateToInventoryRequests);
    wireInventoryTypePicker(dashboard);
    wireCreateRequestForm();
}

function renderInventoryRequestDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    request: InventoryRequestDTO,
): void {
    const actions = availableInventoryRequestActions(request, dashboard);
    const overdue = isRequestOverdue(request);
    const actionControls = renderInventoryDetailActions(request.Status, actions);
    const header = renderDetailCommandHeader({
        backButtonId: 'back-to-inventory-requests',
        backLabel: 'Back to requests',
        eyebrow: 'Equipment request',
        reference: `REQ-${request.DisplayId}`,
        title: request.Name,
        statusHtml: `${overdue ? '<span class="badge badge-error">Overdue</span>' : ''}<span class="badge ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span>`,
        nextStatuses: INVENTORY_NEXT_STATUS_LABELS[request.Status],
        statusSteps: inventoryStatusSteps(request.Status),
        actionsHtml: actionControls,
    });
    const fields = renderRequestFieldGrid([
        {
            title: 'Basic details',
            rows: [
                renderRequestReadonlyFields([
                    { label: 'Requested by', valueHtml: escapeHtml(request.userName) },
                    {
                        label: 'Equipment period',
                        valueHtml: `${escapeHtml(request.StartDate)} to ${escapeHtml(request.EndDate)}`,
                    },
                    {
                        label: 'Participants',
                        valueHtml:
                            request.participants.length > 0
                                ? request.participants.map(namePill).join('')
                                : '<span class="text-base-content/60">No additional participants</span>',
                    },
                ]),
            ],
        },
        {
            title: 'Request state',
            rows: [
                renderRequestReadonlyFields([
                    { label: 'Status', valueHtml: escapeHtml(request.Status) },
                    { label: 'Overdue', valueHtml: overdue ? 'Yes' : 'No' },
                ]),
            ],
        },
    ]);
    const equipment = renderRequestLineSection(
        'Equipment',
        `<div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Item</th><th class="text-right">Quantity</th><th>Return condition</th></tr></thead><tbody>${request.items
            .map(
                (item) =>
                    `<tr><td class="font-medium">${escapeHtml(item.itemName)}</td><td class="text-right">${item.Quantity}</td><td>${item.Condition ? escapeHtml(item.Condition) : '<span class="text-base-content/50">Not returned</span>'}</td></tr>`,
            )
            .join('')}</tbody></table></div>`,
    );
    container.innerHTML = renderRequestDetailPage(
        header,
        renderRequestRecordPanel(
            `${renderRequestDisplayTitle(request.Name)}${fields}${equipment}${renderDetailRequestImages(request)}`,
            'main',
            `id="inventory-request-detail" data-request-id="${escapeHtml(request.Id)}"`,
        ),
        renderRequestActivityPanel({
            comments: request.comments,
            commentFormId: 'request-comment-form',
        }),
        actions.length > 0,
    );
    document
        .getElementById('back-to-inventory-requests')!
        .addEventListener('click', navigateToInventoryRequests);
    wireInventoryRequestDetail(request);
}

function renderInventoryDetailActions(
    status: InventoryRequestStatus,
    actions: InventoryRequestAction[],
): string {
    if (actions.length === 0) return '';
    const primaryByStatus: Partial<Record<InventoryRequestStatus, InventoryRequestAction>> = {
        draft: 'submit',
        submitted: 'approve',
        approved: 'issue',
        rejected: 'close',
        issued: 'return',
        returned: 'close',
        cancelled: 'close',
    };
    const overflow = actions.filter((action) => action === 'cancel');
    const visible = actions.filter((action) => action !== 'cancel');
    return `${visible
        .map(
            (action) =>
                `<button type="button" class="btn btn-sm ${action === primaryByStatus[status] ? 'btn-primary' : INVENTORY_REQUEST_ACTION_BTN[action]}" data-action="${action}">${INVENTORY_REQUEST_ACTION_LABELS[action]}</button>`,
        )
        .join('')}${renderInventoryActionMenu(overflow)}`;
}

function renderInventoryActionMenu(actions: InventoryRequestAction[]): string {
    if (actions.length === 0) return '';
    return `<details class="dropdown dropdown-end"><summary class="btn btn-ghost btn-sm">More</summary><ul class="menu dropdown-content w-40 rounded-box p-2">${actions.map((action) => `<li><button type="button" data-action="${action}">${INVENTORY_REQUEST_ACTION_LABELS[action]}</button></li>`).join('')}</ul></details>`;
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

function wireInventoryRequestDetail(request: InventoryRequestDTO): void {
    document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            await handleInventoryRequestAction(
                request,
                button.dataset.action as InventoryRequestAction,
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

    function addRow(): void {
        const row = document.createElement('div');
        row.className = 'flex gap-2 request-item-row';
        row.innerHTML = `
      <select class="select flex-1" name="inventoryTypeId">
        ${dashboard.inventoryTypes.map((type) => `<option value="${type.Id}">${escapeHtml(type.Name)} (${type.availableQuantity} available)</option>`).join('')}
      </select>
      <input type="number" min="1" value="1" class="input w-20" name="quantity" />
      <button type="button" class="btn btn-ghost btn-sm remove-row" aria-label="Remove item">✕</button>
    `;
        row.querySelector('.remove-row')!.addEventListener('click', () => row.remove());
        list.appendChild(row);
    }

    addButton.addEventListener('click', addRow);
    if (dashboard.inventoryTypes.length > 0) addRow();
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
                row.querySelector('select[name="inventoryTypeId"]') as HTMLSelectElement
            ).value;
            const quantity = Number(
                (row.querySelector('input[name="quantity"]') as HTMLInputElement).value,
            );
            return { inventoryTypeId, quantity };
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
                    startDate: String(data.get('startDate')),
                    endDate: String(data.get('endDate')),
                    items,
                    imageId,
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
            returnItems.push({ requestItemId: item.Id, condition: condition as ReturnCondition });
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
