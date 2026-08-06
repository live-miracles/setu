import { api } from '../api';
import { INVENTORY_REQUEST_QUERY_PARAM, WORKBENCH_MODE_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import {
    navigateToInventoryRequest,
    navigateToInventoryCreate,
    navigateToInventoryEdit,
    navigateToInventoryRequests,
    refreshDashboard,
} from '../router';
import {
    namePill,
    renderDetailCommandHeader,
    renderEmptyState,
    renderSectionHeader,
} from '../ui/components';
import {
    setButtonPending,
    showErrorAlert,
    showSavingBadge,
    showSuccessToast,
} from '../ui/feedback';
import { openFormDialog } from '../ui/dialog';
import { escapeHtml, formatDateTime } from '../ui/format';
import { icon } from '../ui/icons';
import {
    INVENTORY_REQUEST_ACTION_BTN,
    INVENTORY_REQUEST_STATUS_ACCENT,
    INVENTORY_REQUEST_STATUS_BADGE,
    INVENTORY_REQUEST_STATUS_LABEL,
    stockLevelClass,
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

export async function renderInventory(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get(INVENTORY_REQUEST_QUERY_PARAM);
    const mode = params.get(WORKBENCH_MODE_QUERY_PARAM);
    if (mode === 'edit' && requestId) {
        try {
            renderInventoryCreate(container, dashboard, await api.getInventoryRequest(requestId));
        } catch (err) {
            showErrorAlert(err);
            container.innerHTML = renderEmptyState('box', 'This draft could not be opened.');
        }
        return;
    }
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
    if (mode === 'create') {
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
        filterParam: 'equipment',
        filterLabel: 'Equipment',
        filterOptions: dashboard.inventoryTypes.map((type) => ({
            value: type.Id,
            label: type.Name,
        })),
        defaultSort: 'id',
    };
}

function renderInventoryWorkbench(container: HTMLElement, dashboard: DashboardPayload): void {
    const config = inventoryToolbarConfig(dashboard);
    const state = readWorkbenchState(config);
    container.innerHTML = `<section class="space-y-5">
      ${renderSectionHeader(
          'box',
          'Inventory',
          'Request, issue and return equipment.',
          `<button type="button" id="inventory-availability" class="btn btn-ghost btn-sm">Availability</button><button type="button" id="new-inventory-request" class="btn btn-primary btn-sm">${icon('plus', 'size-4')} New request</button>`,
      )}
      ${renderWorkbenchToolbar(config, state)}
      <div id="inventory-results" aria-live="polite"></div>
      ${renderAvailabilityDialog(dashboard)}
    </section>`;
    document
        .getElementById('new-inventory-request')!
        .addEventListener('click', navigateToInventoryCreate);
    const dialog = document.getElementById('availability-dialog') as HTMLDialogElement;
    document
        .getElementById('inventory-availability')!
        .addEventListener('click', () => dialog.showModal());
    dialog.querySelector('[data-close-dialog]')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
    wireWorkbenchToolbar(config, state, (next) => void loadInventoryResults(dashboard, next));
    void loadInventoryResults(dashboard, state);
}

function renderAvailabilityDialog(dashboard: DashboardPayload): string {
    return `<dialog id="availability-dialog" class="modal"><div class="modal-box max-w-2xl"><div class="flex items-start justify-between gap-3"><div><h2 class="font-serif text-2xl">Equipment availability</h2><p class="mt-1 text-sm text-base-content/60">Current quantities available to request.</p></div><button type="button" class="btn btn-ghost btn-sm" data-close-dialog aria-label="Close availability">✕</button></div><ul class="mt-5 divide-y divide-base-200">${
        dashboard.inventoryTypes
            .map((type) => {
                const stock = stockLevelClass(type.availableQuantity, type.TotalQuantity);
                return `<li class="flex items-center gap-4 py-3"><div class="min-w-0 flex-1"><div class="font-medium">${escapeHtml(type.Name)}</div>${type.Description ? `<div class="text-sm text-base-content/60">${escapeHtml(type.Description)}</div>` : ''}</div><div class="w-36 shrink-0"><div class="flex justify-between text-xs ${stock.text}"><span>Available</span><strong>${type.availableQuantity}/${type.TotalQuantity}</strong></div><progress class="progress ${stock.bar} w-full" value="${Math.max(0, type.availableQuantity)}" max="${Math.max(1, type.TotalQuantity)}"></progress></div></li>`;
            })
            .join('') ||
        '<li class="py-8 text-center text-sm text-base-content/50">No equipment catalogued.</li>'
    }</ul></div><form method="dialog" class="modal-backdrop"><button>Close</button></form></dialog>`;
}

function inventoryQuery(
    state: WorkbenchState,
    statuses?: InventoryRequestStatus[],
): InventoryRequestQuery {
    return {
        q: state.q,
        statuses: state.status ? [state.status as InventoryRequestStatus] : statuses,
        inventoryTypeId: state.filter || undefined,
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
    return `<tr><td data-label="Request"><a href="${workItemHref(INVENTORY_REQUEST_QUERY_PARAM, request.Id)}" data-inventory-id="${request.Id}"><span class="font-mono text-xs">REQ-${request.DisplayId}</span><strong>${escapeHtml(request.Name)}</strong></a></td><td data-label="Equipment">${request.items.map((item) => `${escapeHtml(item.itemName)} × ${item.Quantity}`).join('<br />')}</td><td data-label="Dates">${escapeHtml(request.StartDate)} → ${escapeHtml(request.EndDate)}${overdue ? '<small><span class="badge badge-error badge-xs">Overdue</span></small>' : ''}</td><td data-label="Requested by">${escapeHtml(request.userName)}</td><td data-label="Status"><span class="badge badge-sm ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${INVENTORY_REQUEST_STATUS_LABEL[request.Status]}</span></td></tr>`;
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
    draft?: InventoryRequestDTO,
): void {
    container.innerHTML = `<section class="space-y-5"><div class="detail-heading"><button type="button" id="back-to-inventory" class="btn btn-ghost btn-sm">← Back to requests</button><div><p>${draft ? `REQ-${draft.DisplayId} · Draft` : 'New equipment request'}</p><h1>${draft ? 'Edit equipment request' : 'Request equipment'}</h1></div></div><div class="card border border-base-300 bg-base-100"><div class="card-body"><form id="create-request-form" class="space-y-4" data-draft-id="${draft ? escapeHtml(draft.Id) : ''}"><fieldset class="fieldset"><label class="label" for="request-name">Name</label><input id="request-name" name="name" class="input w-full" value="${escapeHtml(draft?.Name || '')}" placeholder="e.g. Studio 2 camera setup" required /><div class="grid gap-3 sm:grid-cols-2"><div><label class="label" for="request-start">From</label><input id="request-start" name="startDate" type="date" class="input w-full" value="${escapeHtml(draft?.StartDate || '')}" required /></div><div><label class="label" for="request-end">To</label><input id="request-end" name="endDate" type="date" class="input w-full" value="${escapeHtml(draft?.EndDate || '')}" required /></div></div><label class="label" for="request-participants">Participants</label><input id="request-participants" name="participants" class="input w-full" value="${escapeHtml(draft?.participants.join(', ') || '')}" placeholder="comma-separated emails (optional)" /><label class="label" for="request-images">Photos</label><input id="request-images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple class="file-input w-full" /><p class="text-xs text-base-content/55">Up to three images. Existing draft images remain unless replacements are uploaded.</p><label class="label">Items</label><div id="request-items" class="space-y-2"></div><div><button type="button" id="add-request-item" class="btn btn-ghost btn-sm">${icon('plus', 'size-4')} Add item</button></div><div id="availability-feedback" class="hidden alert" role="status" aria-live="polite"></div></fieldset><div class="flex flex-wrap gap-2"><button type="submit" name="intent" value="submitted" class="btn btn-primary">${draft ? 'Save and submit' : 'Submit request'}</button><button type="submit" name="intent" value="draft" class="btn btn-outline">Save draft</button><button type="button" id="cancel-inventory" class="btn btn-ghost">Cancel</button></div></form></div></div></section>`;
    document
        .getElementById('back-to-inventory')!
        .addEventListener('click', navigateToInventoryRequests);
    document
        .getElementById('cancel-inventory')!
        .addEventListener('click', navigateToInventoryRequests);
    wireInventoryTypePicker(dashboard, draft?.items || []);
    wireCreateRequestForm(draft);
}

function renderInventoryRequestDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    request: InventoryRequestDTO,
): void {
    const actions = availableInventoryRequestActions(request, dashboard);
    const overdue = isRequestOverdue(request);
    const canEditDraft =
        request.Status === 'draft' &&
        (request.UserId === dashboard.me.Email ||
            request.participants.indexOf(dashboard.me.Email) !== -1);
    const actionControls = `${canEditDraft ? '<button type="button" id="edit-inventory-draft" class="btn btn-outline btn-sm">Edit draft</button>' : ''}${renderInventoryDetailActions(request.Status, actions)}`;
    container.innerHTML = `
    <section class="detail-page ${actions.length ? 'detail-page-has-actions' : ''} space-y-6">
      ${renderDetailCommandHeader({
          backButtonId: 'back-to-inventory-requests',
          backLabel: 'Back to requests',
          eyebrow: 'Equipment request',
          reference: `REQ-${request.DisplayId}`,
          title: request.Name,
          statusHtml: `${overdue ? '<span class="badge badge-error">Overdue</span>' : ''}<span class="badge ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${INVENTORY_REQUEST_STATUS_LABEL[request.Status]}</span>`,
          nextStatuses: INVENTORY_NEXT_STATUS_LABELS[request.Status],
          actionsHtml: actionControls,
      })}

      <div id="inventory-request-detail" data-request-id="${request.Id}" class="space-y-4">
        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-5">
            <dl class="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-base-content/60">Requested by</dt>
                <dd class="mt-1 font-medium">${escapeHtml(request.userName)}</dd>
              </div>
              <div>
                <dt class="text-base-content/60">Equipment period</dt>
                <dd class="mt-1 font-medium">${escapeHtml(request.StartDate)} to ${escapeHtml(request.EndDate)}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-base-content/60">Participants</dt>
                <dd class="mt-1 flex flex-wrap gap-1">${request.participants.length > 0 ? request.participants.map((participant) => namePill(participant)).join('') : '<span class="text-base-content/60">No additional participants</span>'}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-3">
            <h2 class="card-title text-base">Equipment</h2>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>Item</th><th class="text-right">Quantity</th><th>Return condition</th></tr></thead>
                <tbody>${request.items
                    .map(
                        (item) =>
                            `<tr><td class="font-medium">${escapeHtml(item.itemName)}</td><td class="text-right">${item.Quantity}</td><td>${item.Condition ? escapeHtml(item.Condition) : '<span class="text-base-content/50">Not returned</span>'}</td></tr>`,
                    )
                    .join('')}</tbody>
              </table>
            </div>
          </div>
        </div>

        ${renderDetailRequestImages(request)}

        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-3">
            <div class="flex items-baseline justify-between gap-3"><h2 class="card-title text-base">Updates</h2><span class="text-sm text-base-content/60">${request.comments.length}</span></div>
            <div class="space-y-3">
              ${request.comments.length > 0 ? request.comments.map((comment) => `<article class="border-l-2 border-base-300 pl-3"><div class="flex flex-wrap items-baseline gap-x-2"><span class="font-medium">${escapeHtml(comment.userName)}</span><time class="text-xs text-base-content/50">${escapeHtml(formatDateTime(comment.Timestamp))}</time></div><p class="mt-1 text-sm text-base-content/75">${escapeHtml(comment.Message)}</p></article>`).join('') : '<p class="text-sm text-base-content/60">No updates yet.</p>'}
            </div>
            <form class="comment-form flex gap-2 border-t border-base-200 pt-3">
              <input class="input input-sm flex-1" placeholder="Add a comment" name="message" />
              <button type="submit" class="btn btn-sm">Send</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  `;
    document
        .getElementById('back-to-inventory-requests')!
        .addEventListener('click', navigateToInventoryRequests);
    document
        .getElementById('edit-inventory-draft')
        ?.addEventListener('click', () => navigateToInventoryEdit(request.Id));
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
    const ids = [request.Image1Id, request.Image2Id, request.Image3Id].filter(Boolean);
    if (ids.length === 0) return '';
    return `<div class="card border border-base-300 bg-base-100 shadow"><div class="card-body gap-3"><h2 class="card-title text-base">Photos</h2><div class="grid grid-cols-2 gap-3 sm:grid-cols-3">${ids.map((id) => `<img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}" class="aspect-square w-full rounded-box border border-base-300 object-cover" alt="Request photo" />`).join('')}</div></div></div>`;
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
    const detail = document.getElementById('inventory-request-detail')!;
    const page = detail.closest('.detail-page') || detail;
    page.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            await handleInventoryRequestAction(
                request,
                button.dataset.action as InventoryRequestAction,
                button,
            );
        });
    });
    const commentForm = detail.querySelector('.comment-form') as HTMLFormElement;
    commentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = commentForm.querySelector('input[name="message"]') as HTMLInputElement;
        const message = input.value.trim();
        if (!message) return;
        try {
            showSavingBadge(true);
            await api.addComment(request.Id, message, generateRequestId());
            showSuccessToast('Comment added.');
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}

function wireInventoryTypePicker(
    dashboard: DashboardPayload,
    initialItems: InventoryItemDTO[] = [],
): void {
    const list = document.getElementById('request-items')!;
    const addButton = document.getElementById('add-request-item')!;

    function addRow(initial?: InventoryItemDTO): void {
        const row = document.createElement('div');
        row.className = 'flex gap-2 request-item-row';
        row.innerHTML = `
      <select class="select flex-1" name="inventoryTypeId" aria-label="Equipment type">
        ${dashboard.inventoryTypes.map((type) => `<option value="${type.Id}" ${initial?.InventoryTypeId === type.Id ? 'selected' : ''}>${escapeHtml(type.Name)} (${type.availableQuantity} currently available)</option>`).join('')}
      </select>
      <input type="number" min="1" value="${initial?.Quantity || 1}" class="input w-24" name="quantity" aria-label="Quantity" />
      <button type="button" class="btn btn-ghost btn-sm remove-row" aria-label="Remove item">✕</button>
    `;
        row.querySelector('.remove-row')!.addEventListener('click', () => row.remove());
        list.appendChild(row);
    }

    addButton.addEventListener('click', () => addRow());
    if (initialItems.length > 0) initialItems.forEach(addRow);
    else if (dashboard.inventoryTypes.length > 0) addRow();
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

function wireCreateRequestForm(draft?: InventoryRequestDTO): void {
    const form = document.getElementById('create-request-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
        const initialStatus = submitter?.value === 'draft' ? 'draft' : 'submitted';
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
            if (submitter) setButtonPending(submitter, true);
            const startDate = String(data.get('startDate'));
            const endDate = String(data.get('endDate'));
            const availability = await api.getInventoryAvailability(
                startDate,
                endDate,
                items,
                draft?.Id,
            );
            const unavailable = availability.filter((item) => !item.available);
            const feedback = document.getElementById('availability-feedback')!;
            feedback.classList.remove('hidden', 'alert-success', 'alert-warning');
            if (unavailable.length > 0) {
                feedback.classList.add('alert-warning');
                feedback.textContent = `${unavailable.length} item type${unavailable.length === 1 ? '' : 's'} may be unavailable for these dates. Approval will re-check availability.`;
            } else {
                feedback.classList.add('alert-success');
                feedback.textContent = 'Requested quantities are available for these dates.';
            }
            const fileInput = document.getElementById('request-images') as HTMLInputElement;
            const files = fileInput.files ? Array.from(fileInput.files).slice(0, 3) : [];
            const images: string[] = [];
            for (const file of files) {
                const base64 = await readFileAsBase64(file);
                images.push(await api.uploadImage(base64, file.name, file.type));
            }
            const existingImages = draft
                ? [draft.Image1Id, draft.Image2Id, draft.Image3Id].filter(Boolean)
                : [];
            const input: CreateInventoryRequestInput = {
                name: String(data.get('name')),
                startDate,
                endDate,
                items,
                images: images.length > 0 ? images : existingImages,
                participants: String(data.get('participants') || ''),
                initialStatus,
            };
            const created = draft
                ? await api.updateInventoryRequestDraft(draft.Id, input, generateRequestId())
                : await api.createInventoryRequest(input, generateRequestId());
            showSuccessToast(initialStatus === 'draft' ? 'Draft saved.' : 'Request submitted.');
            navigateToInventoryRequest(created.Id);
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
            if (submitter?.isConnected) setButtonPending(submitter, false);
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
          <span class="badge badge-xs ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${INVENTORY_REQUEST_STATUS_LABEL[request.Status]}</span>
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
    trigger: HTMLButtonElement,
): Promise<void> {
    const noteRequired = action === 'reject' || action === 'cancel';
    const fields = [];
    if (noteRequired || ['approve', 'issue', 'close'].includes(action)) {
        fields.push({
            name: 'note',
            label: noteRequired ? 'Reason' : 'Note (optional)',
            type: 'textarea' as const,
            required: noteRequired,
            minLength: noteRequired ? 3 : undefined,
            placeholder: noteRequired
                ? 'Explain why this action is needed.'
                : 'Add context for the activity log.',
        });
    }
    if (action === 'return') {
        request.items.forEach((item, index) =>
            fields.push({
                name: `condition-${index}`,
                label: `${item.itemName} × ${item.Quantity}`,
                type: 'select' as const,
                value: 'good',
                required: true,
                options: [
                    { value: 'good', label: 'Good' },
                    { value: 'damaged', label: 'Damaged' },
                    { value: 'missing', label: 'Missing' },
                ],
            }),
        );
    }
    const values = await openFormDialog({
        title: `${INVENTORY_REQUEST_ACTION_LABELS[action]} REQ-${request.DisplayId}?`,
        description:
            action === 'return'
                ? 'Record the condition of every item in one return.'
                : `This will move the request from ${INVENTORY_REQUEST_STATUS_LABEL[request.Status]} to its next lifecycle state.`,
        confirmLabel: INVENTORY_REQUEST_ACTION_LABELS[action],
        tone: action === 'reject' || action === 'cancel' ? 'danger' : 'primary',
        fields,
    });
    if (!values) return;
    const note = values.note || '';
    const returnItems: ReturnItemInput[] | null =
        action === 'return'
            ? request.items.map((item, index) => ({
                  requestItemId: item.Id,
                  condition: values[`condition-${index}`] as ReturnCondition,
              }))
            : null;

    try {
        setButtonPending(trigger, true);
        showSavingBadge(true);
        await api.performInventoryRequestAction(
            request.Id,
            action,
            note,
            returnItems,
            generateRequestId(),
        );
        showSuccessToast(`REQ-${request.DisplayId} updated.`);
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
        if (trigger.isConnected) setButtonPending(trigger, false);
    }
}
