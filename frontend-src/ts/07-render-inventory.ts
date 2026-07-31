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
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title">Request equipment</h2>
          <form id="create-request-form" class="space-y-2">
            <input name="title" class="input input-bordered w-full" placeholder="Title" required />
            <div class="flex gap-2">
              <input name="fromDate" type="date" class="input input-bordered" required />
              <input name="toDate" type="date" class="input input-bordered" required />
            </div>
            <textarea name="purpose" class="textarea textarea-bordered w-full" placeholder="Purpose"></textarea>
            <div id="request-items" class="space-y-2"></div>
            <button type="button" id="add-request-item" class="btn btn-sm">+ Add item</button>
            <button type="submit" class="btn btn-primary">Submit request</button>
          </form>
        </div>
      </div>

      ${
          isAdmin
              ? `<div class="card bg-base-100 shadow">
              <div class="card-body gap-2">
                <h2 class="card-title">Add equipment item (admin)</h2>
                <form id="create-item-form" class="grid grid-cols-2 gap-2">
                  <select name="equipmentTypeId" class="select select-bordered col-span-2" required>
                    ${dashboard.equipmentTypes.map((t) => `<option value="${t.Id}">${escapeHtml(t.Name)}</option>`).join('')}
                  </select>
                  <input name="name" class="input input-bordered" placeholder="Item name" required />
                  <select name="locationId" class="select select-bordered" required>
                    ${dashboard.locations.map((l) => `<option value="${l.Id}">${escapeHtml(l.Name)}</option>`).join('')}
                  </select>
                  <input name="serialNumber" class="input input-bordered" placeholder="Serial number" />
                  <input name="totalQuantity" type="number" min="0" class="input input-bordered" placeholder="Quantity" required />
                  <textarea name="adminNotes" class="textarea textarea-bordered col-span-2" placeholder="Admin notes"></textarea>
                  <button type="submit" class="btn btn-primary col-span-2">Add item</button>
                </form>
              </div>
            </div>`
              : ''
      }

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Equipment catalogue</h2>
          <ul class="divide-y">
            ${dashboard.inventoryItems
                .map(
                    (item) => `
                  <li class="py-2 flex justify-between">
                    <div>
                      <div class="font-medium">${escapeHtml(item.Name)} <span class="opacity-60 text-sm">(${escapeHtml(item.equipmentTypeName)})</span></div>
                      <div class="text-sm opacity-70">${escapeHtml(item.locationName)}</div>
                    </div>
                    <div class="badge">${item.AvailableQuantity}/${item.TotalQuantity} available</div>
                  </li>`,
                )
                .join('')}
          </ul>
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Requests</h2>
          <ul id="inventory-request-list" class="divide-y"></ul>
        </div>
      </div>
    </section>
  `;

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
      <select class="select select-bordered flex-1" name="itemId">
        ${dashboard.inventoryItems.map((item) => `<option value="${item.Id}">${escapeHtml(item.Name)} (${item.AvailableQuantity} available)</option>`).join('')}
      </select>
      <input type="number" min="1" value="1" class="input input-bordered w-24" name="quantity" />
      <button type="button" class="btn btn-ghost btn-sm remove-row">✕</button>
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
            ? '<li class="py-2 opacity-70">No requests yet.</li>'
            : dashboard.inventoryRequests
                  .map((request) => {
                      const isOwner = request.RequesterId === dashboard.me.Id;
                      const actions = allActions.filter((action) => {
                          if (!canTransitionInventoryRequest(request.Status, action)) return false;
                          return action === 'submit' ? isOwner : isAdmin;
                      });
                      return `
              <li class="py-2" data-request-id="${request.Id}">
                <div class="flex justify-between items-start gap-2">
                  <div>
                    <div class="font-medium">REQ-${request.DisplayId} — ${escapeHtml(request.Title)}</div>
                    <div class="text-sm opacity-70">${escapeHtml(request.requesterName)} · ${escapeHtml(request.FromDate)} to ${escapeHtml(request.ToDate)}</div>
                    <ul class="text-sm list-disc list-inside">
                      ${request.items
                          .map(
                              (i) =>
                                  `<li>${escapeHtml(i.itemName)} × ${i.Quantity}${i.IssuedQuantity ? ` (issued ${i.IssuedQuantity}, returned ${i.ReturnedQuantity})` : ''}</li>`,
                          )
                          .join('')}
                    </ul>
                  </div>
                  <span class="badge shrink-0">${escapeHtml(request.Status)}</span>
                </div>
                <div class="flex gap-2 mt-2 flex-wrap request-actions">
                  ${actions.map((action) => `<button type="button" class="btn btn-xs" data-action="${action}">${INVENTORY_REQUEST_ACTION_LABELS[action]}</button>`).join('')}
                </div>
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
