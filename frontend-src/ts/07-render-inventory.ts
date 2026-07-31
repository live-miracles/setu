const INVENTORY_REQUEST_ACTION_LABELS: Record<InventoryRequestAction, string> = {
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    issue: 'Issue',
    return: 'Return',
    cancel: 'Cancel',
    close: 'Close',
};

async function renderInventory(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const isAdmin = dashboard.me.Role === 'admin';

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('box', 'Inventory', 'Request, issue and return equipment.')}

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Request equipment</h2>
          <form id="create-request-form" class="space-y-3">
            <fieldset class="fieldset">
              <label class="label" for="request-title">Title</label>
              <input id="request-title" name="title" class="input w-full" placeholder="e.g. Studio 2 camera setup" required />
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="request-from">From</label>
                  <input id="request-from" name="fromDate" type="date" class="input w-full" required />
                </div>
                <div>
                  <label class="label" for="request-to">To</label>
                  <input id="request-to" name="toDate" type="date" class="input w-full" required />
                </div>
              </div>
              <label class="label" for="request-purpose">Purpose</label>
              <textarea id="request-purpose" name="purpose" class="textarea w-full" placeholder="Where and how will this be used?"></textarea>
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

      ${
          isAdmin
              ? `<div class="card border border-base-300 bg-base-100 shadow">
              <div class="card-body gap-3">
                <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Add equipment item</h2>
                <form id="create-item-form" class="space-y-3">
                  <fieldset class="fieldset">
                    <label class="label" for="item-type">Equipment type</label>
                    <select id="item-type" name="equipmentTypeId" class="select w-full" required>
                      ${dashboard.equipmentTypes.map((t) => `<option value="${t.Id}">${escapeHtml(t.Name)}</option>`).join('')}
                    </select>
                    <div class="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label class="label" for="item-name">Item name</label>
                        <input id="item-name" name="name" class="input w-full" required />
                      </div>
                      <div>
                        <label class="label" for="item-location">Location</label>
                        <select id="item-location" name="locationId" class="select w-full" required>
                          ${dashboard.locations.map((l) => `<option value="${l.Id}">${escapeHtml(l.Name)}</option>`).join('')}
                        </select>
                      </div>
                      <div>
                        <label class="label" for="item-serial">Serial number</label>
                        <input id="item-serial" name="serialNumber" class="input w-full" />
                      </div>
                      <div>
                        <label class="label" for="item-quantity">Quantity</label>
                        <input id="item-quantity" name="totalQuantity" type="number" min="0" class="input w-full" required />
                      </div>
                    </div>
                    <label class="label" for="item-notes">Admin notes</label>
                    <textarea id="item-notes" name="adminNotes" class="textarea w-full"></textarea>
                  </fieldset>
                  <button type="submit" class="btn btn-primary">Add item</button>
                </form>
              </div>
            </div>`
              : ''
      }

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title text-base">Equipment catalogue</h2>
          ${
              dashboard.inventoryItems.length === 0
                  ? renderEmptyState('box', 'No equipment catalogued yet.')
                  : `<ul class="divide-y divide-base-200">${dashboard.inventoryItems
                        .map((item) => {
                            const stock = stockLevelClass(
                                item.AvailableQuantity,
                                item.TotalQuantity,
                            );
                            return `
                      <li class="flex items-center gap-3 py-2.5">
                        <div class="min-w-0 flex-1">
                          <div class="truncate font-medium">${escapeHtml(item.Name)} <span class="text-sm font-normal opacity-60">(${escapeHtml(item.equipmentTypeName)})</span></div>
                          <div class="text-sm text-base-content/60">${escapeHtml(item.locationName)}${item.SerialNumber ? ` · ${escapeHtml(item.SerialNumber)}` : ''}</div>
                        </div>
                        <div class="w-32 shrink-0 sm:w-40">
                          <div class="flex justify-between text-xs ${stock.text}">
                            <span>Available</span>
                            <span class="font-medium">${item.AvailableQuantity}/${item.TotalQuantity}</span>
                          </div>
                          <progress class="progress ${stock.bar} w-full" value="${item.TotalQuantity > 0 ? item.AvailableQuantity : 0}" max="${Math.max(item.TotalQuantity, 1)}"></progress>
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

    wireInternalNavLinks(container);
    wireInventoryItemPicker(dashboard);
    wireCreateRequestForm();
    if (isAdmin) wireCreateItemForm();
    renderInventoryRequestList(dashboard);
}

function wireInventoryItemPicker(dashboard: DashboardPayload): void {
    const list = document.getElementById('request-items')!;
    const addButton = document.getElementById('add-request-item')!;

    function addRow(): void {
        const row = document.createElement('div');
        row.className = 'flex gap-2 request-item-row';
        row.innerHTML = `
      <select class="select flex-1" name="itemId">
        ${dashboard.inventoryItems.map((item) => `<option value="${item.Id}">${escapeHtml(item.Name)} (${item.AvailableQuantity} available)</option>`).join('')}
      </select>
      <input type="number" min="1" value="1" class="input w-20" name="quantity" />
      <button type="button" class="btn btn-ghost btn-sm remove-row" aria-label="Remove item">✕</button>
    `;
        row.querySelector('.remove-row')!.addEventListener('click', () => row.remove());
        list.appendChild(row);
    }

    addButton.addEventListener('click', addRow);
    if (dashboard.inventoryItems.length > 0) addRow();
}

function wireCreateRequestForm(): void {
    const form = document.getElementById('create-request-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const items = Array.from(form.querySelectorAll('.request-item-row')).map((row) => {
            const inventoryItemId = (
                row.querySelector('select[name="itemId"]') as HTMLSelectElement
            ).value;
            const quantity = Number(
                (row.querySelector('input[name="quantity"]') as HTMLInputElement).value,
            );
            return { inventoryItemId, quantity };
        });
        if (items.length === 0) {
            showErrorAlert(new Error('Add at least one item.'));
            return;
        }
        try {
            showSavingBadge(true);
            await api.createInventoryRequest(
                {
                    title: String(data.get('title')),
                    fromDate: String(data.get('fromDate')),
                    toDate: String(data.get('toDate')),
                    purpose: String(data.get('purpose') || ''),
                    items,
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

function wireCreateItemForm(): void {
    const form = document.getElementById('create-item-form') as HTMLFormElement | null;
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        try {
            showSavingBadge(true);
            await api.createInventoryItem(
                {
                    equipmentTypeId: String(data.get('equipmentTypeId')),
                    name: String(data.get('name')),
                    locationId: String(data.get('locationId')),
                    serialNumber: String(data.get('serialNumber') || ''),
                    totalQuantity: Number(data.get('totalQuantity')),
                    adminNotes: String(data.get('adminNotes') || ''),
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

function renderInventoryRequestList(dashboard: DashboardPayload): void {
    const list = document.getElementById('inventory-request-list');
    if (!list) return;
    const isAdmin = dashboard.me.Role === 'admin';
    const allActions: InventoryRequestAction[] = [
        'submit',
        'approve',
        'reject',
        'issue',
        'return',
        'cancel',
        'close',
    ];

    list.innerHTML =
        dashboard.inventoryRequests.length === 0
            ? `<li>${renderEmptyState('box', 'No requests yet.')}</li>`
            : dashboard.inventoryRequests
                  .map((request) => {
                      const isOwner = request.RequesterId === dashboard.me.Id;
                      const actions = allActions.filter((action) => {
                          if (!canTransitionInventoryRequest(request.Status, action)) return false;
                          return action === 'submit' ? isOwner : isAdmin;
                      });
                      const overdue = isRequestOverdue(request);
                      return `
              <li class="rounded-box border-l-4 ${INVENTORY_REQUEST_STATUS_ACCENT[request.Status]} bg-base-200/40 p-3" data-request-id="${request.Id}">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-medium">
                      <span class="font-mono text-xs text-base-content/50">REQ-${request.DisplayId}</span>
                      ${escapeHtml(request.Title)}
                    </div>
                    <div class="text-sm text-base-content/60">${escapeHtml(request.requesterName)} · ${escapeHtml(request.FromDate)} to ${escapeHtml(request.ToDate)}</div>
                    <ul class="mt-1 list-inside list-disc text-sm text-base-content/70">
                      ${request.items
                          .map(
                              (i) =>
                                  `<li>${escapeHtml(i.itemName)} × ${i.Quantity}${i.IssuedQuantity ? ` (issued ${i.IssuedQuantity}, returned ${i.ReturnedQuantity})` : ''}</li>`,
                          )
                          .join('')}
                    </ul>
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
        const commentForm = li.querySelector('.comment-form') as HTMLFormElement;
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = commentForm.querySelector('input[name="message"]') as HTMLInputElement;
            const message = input.value.trim();
            if (!message) return;
            try {
                showSavingBadge(true);
                await api.addComment('inventory_request', requestId, message, generateRequestId());
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
            const remaining = item.IssuedQuantity - item.ReturnedQuantity;
            if (remaining <= 0) continue;
            const qtyStr = window.prompt(
                `Return quantity for ${item.itemName} (up to ${remaining}):`,
                String(remaining),
            );
            if (!qtyStr) continue;
            const quantity = Number(qtyStr);
            if (!(quantity > 0)) continue;
            const notes = window.prompt('Condition notes (required, at least 3 characters):') || '';
            if (notes.trim().length < 3) continue;
            const condition = (window.prompt('Condition: good, damaged, or missing', 'good') ||
                'good') as ReturnCondition;
            returnItems.push({ requestItemId: item.Id, quantity, condition, notes });
        }
        if (returnItems.length === 0) return;
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
