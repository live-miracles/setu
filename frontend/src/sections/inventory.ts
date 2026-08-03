import { api } from '../api';
import { INVENTORY_REQUEST_QUERY_PARAM } from '../config';
import { generateRequestId } from '../ids';
import {
    navigateToInventoryRequest,
    navigateToInventoryRequests,
    refreshDashboard,
} from '../router';
import { getState } from '../state';
import {
    namePill,
    renderCommentLine,
    renderEmptyState,
    renderSectionHeader,
} from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml, formatDateTime } from '../ui/format';
import { icon } from '../ui/icons';
import {
    INVENTORY_REQUEST_ACTION_BTN,
    INVENTORY_REQUEST_STATUS_ACCENT,
    INVENTORY_REQUEST_STATUS_BADGE,
    stockLevelClass,
} from '../ui/styles';
import { canApprove, canTransitionInventoryRequest, isRequestOverdue } from '../workflows';

const INVENTORY_REQUEST_ACTION_LABELS: Record<InventoryRequestAction, string> = {
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    issue: 'Issue',
    return: 'Return',
    cancel: 'Cancel',
    close: 'Close',
};

const ALL_INVENTORY_REQUEST_ACTIONS: InventoryRequestAction[] = [
    'submit',
    'approve',
    'reject',
    'issue',
    'return',
    'cancel',
    'close',
];

export async function renderInventory(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const requestId = new URLSearchParams(window.location.search).get(
        INVENTORY_REQUEST_QUERY_PARAM,
    );
    const selectedRequest = requestId
        ? dashboard.inventoryRequests.find((request) => request.Id === requestId)
        : undefined;
    if (selectedRequest) {
        renderInventoryRequestDetail(container, dashboard, selectedRequest);
        return;
    }

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('box', 'Inventory', 'Request, issue and return equipment.')}

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Request equipment</h2>
          <form id="create-request-form" class="space-y-3">
            <fieldset class="fieldset">
              <label class="label" for="request-name">Name</label>
              <input id="request-name" name="name" class="input w-full" placeholder="e.g. Studio 2 camera setup" required />
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="request-start">From</label>
                  <input id="request-start" name="startDate" type="date" class="input w-full" required />
                </div>
                <div>
                  <label class="label" for="request-end">To</label>
                  <input id="request-end" name="endDate" type="date" class="input w-full" required />
                </div>
              </div>
              <label class="label" for="request-participants">Participants</label>
              <input id="request-participants" name="participants" class="input w-full" placeholder="comma-separated emails (optional)" />
              <label class="label" for="request-images">Photos</label>
              <input id="request-images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple class="file-input w-full" />
              <label class="label">Items</label>
              <div id="request-items" class="space-y-2"></div>
              <div>
                <button type="button" id="add-request-item" class="btn btn-ghost btn-sm">
                  ${icon('plus', 'size-4')} Add item
                </button>
              </div>
            </fieldset>
            <button type="submit" class="btn btn-primary">Submit request</button>
          </form>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title text-base">Equipment catalogue</h2>
          ${
              dashboard.inventoryTypes.length === 0
                  ? renderEmptyState('box', 'No equipment catalogued yet.')
                  : `<ul class="divide-y divide-base-200">${dashboard.inventoryTypes
                        .map((type) => {
                            const stock = stockLevelClass(
                                type.availableQuantity,
                                type.TotalQuantity,
                            );
                            return `
                      <li class="flex items-center gap-3 py-2.5">
                        <div class="min-w-0 flex-1">
                          <div class="truncate font-medium">${escapeHtml(type.Name)}</div>
                          ${type.Description ? `<div class="text-sm text-base-content/60">${escapeHtml(type.Description)}</div>` : ''}
                        </div>
                        <div class="w-32 shrink-0 sm:w-40">
                          <div class="flex justify-between text-xs ${stock.text}">
                            <span>Available</span>
                            <span class="font-medium">${type.availableQuantity}/${type.TotalQuantity}</span>
                          </div>
                          <progress class="progress ${stock.bar} w-full" value="${type.TotalQuantity > 0 ? type.availableQuantity : 0}" max="${Math.max(type.TotalQuantity, 1)}"></progress>
                        </div>
                      </li>`;
                        })
                        .join('')}</ul>`
          }
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title text-base">Requests</h2>
          <ul id="inventory-request-list" class="space-y-2"></ul>
        </div>
      </div>
    </section>
  `;

    wireInventoryTypePicker(dashboard);
    wireCreateRequestForm();
    renderInventoryRequestList(dashboard);
}

function renderInventoryRequestDetail(
    container: HTMLElement,
    dashboard: DashboardPayload,
    request: InventoryRequestDTO,
): void {
    const actions = availableInventoryRequestActions(request, dashboard);
    const overdue = isRequestOverdue(request);
    container.innerHTML = `
    <section class="space-y-6">
      <div class="flex items-center gap-3">
        <button type="button" id="back-to-inventory-requests" class="btn btn-ghost btn-sm">← Back to requests</button>
        <div>
          <p class="text-sm text-base-content/60">Equipment request</p>
          <h1 class="text-2xl font-semibold">${escapeHtml(request.Name)}</h1>
        </div>
      </div>

      <div id="inventory-request-detail" data-request-id="${request.Id}" class="space-y-4">
        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body gap-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-mono text-sm text-base-content/60">REQ-${request.DisplayId}</p>
                <h2 class="card-title text-xl">${escapeHtml(request.Name)}</h2>
              </div>
              <div class="flex flex-wrap gap-2">
                ${overdue ? '<span class="badge badge-error">Overdue</span>' : ''}
                <span class="badge ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span>
              </div>
            </div>
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
            <h2 class="card-title text-base">Actions</h2>
            <div class="request-actions flex flex-wrap gap-2">
              ${actions.length > 0 ? actions.map((action) => `<button type="button" class="btn btn-sm ${INVENTORY_REQUEST_ACTION_BTN[action]}" data-action="${action}">${INVENTORY_REQUEST_ACTION_LABELS[action]}</button>`).join('') : '<p class="text-sm text-base-content/60">No actions are available for this request.</p>'}
            </div>
          </div>
        </div>

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
    wireInventoryRequestDetail(request.Id);
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

function wireInventoryRequestDetail(requestId: string): void {
    const detail = document.getElementById('inventory-request-detail')!;
    detail.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            await handleInventoryRequestAction(
                requestId,
                button.dataset.action as InventoryRequestAction,
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
            await api.addComment(requestId, message, generateRequestId());
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
            const fileInput = document.getElementById('request-images') as HTMLInputElement;
            const files = fileInput.files ? Array.from(fileInput.files).slice(0, 3) : [];
            const images: string[] = [];
            for (const file of files) {
                const base64 = await readFileAsBase64(file);
                images.push(await api.uploadImage(base64, file.name, file.type));
            }
            await api.createInventoryRequest(
                {
                    name: String(data.get('name')),
                    startDate: String(data.get('startDate')),
                    endDate: String(data.get('endDate')),
                    items,
                    images,
                    participants: String(data.get('participants') || ''),
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

function renderRequestImages(request: InventoryRequestDTO): string {
    const ids = [request.Image1Id, request.Image2Id, request.Image3Id].filter(Boolean);
    if (ids.length === 0) return '';
    return `<div class="mt-1.5 flex gap-1.5">${ids
        .map(
            (id) =>
                `<img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}" class="size-14 rounded-box border border-base-300 object-cover" alt="" />`,
        )
        .join('')}</div>`;
}

function renderInventoryRequestList(
    dashboard: DashboardPayload,
    requests: InventoryRequestDTO[] = dashboard.inventoryRequests,
): void {
    const list = document.getElementById('inventory-request-list');
    if (!list) return;
    list.innerHTML =
        requests.length === 0
            ? `<li>${renderEmptyState('box', 'No requests yet.')}</li>`
            : requests
                  .map((request) => {
                      const actions = availableInventoryRequestActions(request, dashboard);
                      const overdue = isRequestOverdue(request);
                      return `
              <li class="cursor-pointer rounded-box border-l-4 ${INVENTORY_REQUEST_STATUS_ACCENT[request.Status]} bg-base-200/40 p-3" data-request-id="${request.Id}" data-request-card>
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-medium">
                      <span class="font-mono text-xs text-base-content/50">REQ-${request.DisplayId}</span>
                      ${escapeHtml(request.Name)}
                    </div>
                    <div class="text-sm text-base-content/60">${escapeHtml(request.userName)} · ${escapeHtml(request.StartDate)} to ${escapeHtml(request.EndDate)}</div>
                    ${request.participants.length > 0 ? `<div class="mt-1 flex flex-wrap gap-1">${request.participants.map((p) => namePill(p)).join('')}</div>` : ''}
                    <ul class="mt-1 list-inside list-disc text-sm text-base-content/70">
                      ${request.items
                          .map(
                              (i) =>
                                  `<li>${escapeHtml(i.itemName)} × ${i.Quantity}${i.Condition ? ` (${escapeHtml(i.Condition)})` : ''}</li>`,
                          )
                          .join('')}
                    </ul>
                    ${renderRequestImages(request)}
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1">
                    ${overdue ? '<span class="badge badge-error badge-sm">Overdue</span>' : ''}
                    <span class="badge badge-sm ${INVENTORY_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span>
                  </div>
                </div>
                <div class="request-actions mt-2 flex flex-wrap gap-2">
                  ${actions.map((action) => `<button type="button" class="btn btn-xs ${INVENTORY_REQUEST_ACTION_BTN[action]}" data-action="${action}">${INVENTORY_REQUEST_ACTION_LABELS[action]}</button>`).join('')}
                </div>

                <details class="collapse-arrow collapse mt-2 rounded-box border border-base-200 bg-base-100">
                  <summary class="collapse-title min-h-0 px-3 py-2 text-sm font-medium after:!size-3">
                    ${request.comments.length} update${request.comments.length === 1 ? '' : 's'}
                  </summary>
                  <div class="collapse-content space-y-2 px-3 text-sm">
                    <div class="comment-list space-y-1.5">
                      ${request.comments.map((c) => renderCommentLine(c)).join('') || '<p class="text-base-content/40">No updates yet.</p>'}
                    </div>
                    <form class="comment-form flex gap-2 pt-1">
                      <input class="input input-sm flex-1" placeholder="Add a comment" name="message" />
                      <button type="submit" class="btn btn-sm">Send</button>
                    </form>
                  </div>
                </details>
              </li>`;
                  })
                  .join('');

    list.querySelectorAll('button[data-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const li = button.closest('li[data-request-id]') as HTMLElement;
            const requestId = li.dataset.requestId!;
            const action = button.getAttribute('data-action') as InventoryRequestAction;
            await handleInventoryRequestAction(requestId, action);
        });
    });

    list.querySelectorAll<HTMLElement>('li[data-request-id]').forEach((li) => {
        const requestId = li.dataset.requestId!;
        li.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (target.closest('button, input, select, textarea, label, summary, details, a'))
                return;
            navigateToInventoryRequest(requestId);
        });
        const commentForm = li.querySelector('.comment-form') as HTMLFormElement;
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = commentForm.querySelector('input[name="message"]') as HTMLInputElement;
            const message = input.value.trim();
            if (!message) return;
            try {
                showSavingBadge(true);
                await api.addComment(requestId, message, generateRequestId());
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            } finally {
                showSavingBadge(false);
            }
        });
    });
}

async function handleInventoryRequestAction(
    requestId: string,
    action: InventoryRequestAction,
): Promise<void> {
    let note = '';
    if (action === 'reject' || action === 'cancel') {
        note = window.prompt('Add a note (required, at least 3 characters):') || '';
        if (note.trim().length < 3) return;
    }

    let returnItems: ReturnItemInput[] | null = null;
    if (action === 'return') {
        const dashboard = getState().dashboard;
        const request = dashboard?.inventoryRequests.find((r) => r.Id === requestId);
        if (!request) return;
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
            requestId,
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
