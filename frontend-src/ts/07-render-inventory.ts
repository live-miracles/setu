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
                            const stock = stockLevelClass(type.availableQuantity, type.TotalQuantity);
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

    wireInternalNavLinks(container);
    wireInventoryTypePicker(dashboard);
    wireCreateRequestForm();
    renderInventoryRequestList(dashboard);
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
                      const isOwner =
                          request.UserId === dashboard.me.Email ||
                          request.participants.indexOf(dashboard.me.Email) !== -1;
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
