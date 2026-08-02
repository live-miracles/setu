import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
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
    PROGRAM_REQUEST_ACTION_BTN,
    PROGRAM_REQUEST_STATUS_ACCENT,
    PROGRAM_REQUEST_STATUS_BADGE,
} from '../ui/styles';
import { canApprove, canTransitionProgramRequest } from '../workflows';

const PROGRAM_REQUEST_ACTION_LABELS: Record<ProgramRequestAction, string> = {
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    cancel: 'Cancel',
    close: 'Close',
};

export async function renderPrograms(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('clapper', 'Programs', 'Book a place and schedule its sessions.')}

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-3">
          <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Request a program</h2>
          <form id="create-program-form" class="space-y-3">
            <fieldset class="fieldset">
              <label class="label" for="program-name">Name</label>
              <input id="program-name" name="name" class="input w-full" placeholder="e.g. Sunday livestream" required />
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="program-type">Type</label>
                  <input id="program-type" name="type" class="input w-full" placeholder="e.g. Livestream" required />
                </div>
                <div>
                  <label class="label" for="program-place">Place</label>
                  <select id="program-place" name="placeId" class="select w-full" required>
                    ${dashboard.places.map((p) => `<option value="${p.Id}">${escapeHtml(p.Name)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <label class="label" for="program-participants">Participants</label>
              <input id="program-participants" name="participants" class="input w-full" placeholder="comma-separated emails (optional)" />
              <label class="label">Sessions</label>
              <div id="program-sessions" class="space-y-2"></div>
              <div>
                <button type="button" id="add-program-session" class="btn btn-ghost btn-sm">
                  ${icon('plus', 'size-4')} Add session
                </button>
              </div>
            </fieldset>
            <button type="submit" class="btn btn-primary">Submit request</button>
          </form>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title text-base">Requests</h2>
          <ul id="program-request-list" class="space-y-2"></ul>
        </div>
      </div>
    </section>
  `;

    wireSessionRows();
    wireCreateProgramForm();
    renderProgramRequestList(dashboard);
}

function wireSessionRows(): void {
    const list = document.getElementById('program-sessions')!;
    const addButton = document.getElementById('add-program-session')!;

    function addRow(): void {
        const row = document.createElement('div');
        row.className =
            'grid gap-2 rounded-box border border-base-200 p-2 sm:grid-cols-2 program-session-row';
        row.innerHTML = `
      <input class="input input-sm" name="sessionName" placeholder="Session name" />
      <div class="flex gap-2">
        <input class="input input-sm flex-1" name="sessionType" placeholder="Session type" />
        <button type="button" class="btn btn-ghost btn-sm remove-row" aria-label="Remove session">✕</button>
      </div>
      <label class="label text-xs" for="">Start</label>
      <label class="label text-xs" for="">End</label>
      <input type="datetime-local" class="input input-sm" name="startDateTime" />
      <input type="datetime-local" class="input input-sm" name="endDateTime" />
    `;
        row.querySelector('.remove-row')!.addEventListener('click', () => row.remove());
        list.appendChild(row);
    }

    addButton.addEventListener('click', addRow);
    addRow();
}

function wireCreateProgramForm(): void {
    const form = document.getElementById('create-program-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const sessions = Array.from(form.querySelectorAll('.program-session-row')).map((row) => {
            const startDateTime = (
                row.querySelector('input[name="startDateTime"]') as HTMLInputElement
            ).value;
            const endDateTime = (row.querySelector('input[name="endDateTime"]') as HTMLInputElement)
                .value;
            return {
                name: String(
                    (row.querySelector('input[name="sessionName"]') as HTMLInputElement).value,
                ),
                type: String(
                    (row.querySelector('input[name="sessionType"]') as HTMLInputElement).value,
                ),
                startDateTime: startDateTime ? new Date(startDateTime).toISOString() : '',
                endDateTime: endDateTime ? new Date(endDateTime).toISOString() : '',
            };
        });
        if (sessions.length === 0) {
            showErrorAlert(new Error('Add at least one session.'));
            return;
        }
        try {
            showSavingBadge(true);
            await api.createProgramRequest(
                {
                    name: String(data.get('name')),
                    type: String(data.get('type')),
                    placeId: String(data.get('placeId')),
                    sessions,
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

function renderProgramRequestList(dashboard: DashboardPayload): void {
    const list = document.getElementById('program-request-list');
    if (!list) return;
    const isApprover = canApprove(dashboard.me);
    const allActions: ProgramRequestAction[] = ['submit', 'approve', 'reject', 'cancel', 'close'];

    list.innerHTML =
        dashboard.programRequests.length === 0
            ? `<li>${renderEmptyState('clapper', 'No program requests yet.')}</li>`
            : dashboard.programRequests
                  .map((request) => {
                      const isOwner =
                          request.UserId === dashboard.me.Email ||
                          request.participants.indexOf(dashboard.me.Email) !== -1;
                      const actions = allActions.filter((action) => {
                          if (!canTransitionProgramRequest(request.Status, action)) return false;
                          return action === 'submit' ? isOwner : isApprover;
                      });
                      return `
              <li class="rounded-box border-l-4 ${PROGRAM_REQUEST_STATUS_ACCENT[request.Status]} bg-base-200/40 p-3" data-request-id="${request.Id}">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-medium">
                      <span class="font-mono text-xs text-base-content/50">PRG-${request.DisplayId}</span>
                      ${escapeHtml(request.Name)}
                    </div>
                    <div class="text-sm text-base-content/60">${escapeHtml(request.userName)} · ${escapeHtml(request.Type)} · ${escapeHtml(request.placeName)}</div>
                    ${request.participants.length > 0 ? `<div class="mt-1 flex flex-wrap gap-1">${request.participants.map((p) => namePill(p)).join('')}</div>` : ''}
                    <ul class="mt-1 list-inside list-disc text-sm text-base-content/70">
                      ${request.sessions
                          .map(
                              (s) =>
                                  `<li>${escapeHtml(s.Name)} (${escapeHtml(s.Type)}) · ${formatDateTime(s.StartDateTime)} – ${formatDateTime(s.EndDateTime)}</li>`,
                          )
                          .join('')}
                    </ul>
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1">
                    <span class="badge badge-sm ${PROGRAM_REQUEST_STATUS_BADGE[request.Status]}">${escapeHtml(request.Status)}</span>
                  </div>
                </div>
                <div class="request-actions mt-2 flex flex-wrap gap-2">
                  ${actions.map((action) => `<button type="button" class="btn btn-xs ${PROGRAM_REQUEST_ACTION_BTN[action]}" data-action="${action}">${PROGRAM_REQUEST_ACTION_LABELS[action]}</button>`).join('')}
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
            const action = button.getAttribute('data-action') as ProgramRequestAction;
            await handleProgramRequestAction(requestId, action);
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

async function handleProgramRequestAction(
    requestId: string,
    action: ProgramRequestAction,
): Promise<void> {
    let note = '';
    if (action === 'reject' || action === 'cancel') {
        note = window.prompt('Add a note (required, at least 3 characters):') || '';
        if (note.trim().length < 3) return;
    }

    try {
        showSavingBadge(true);
        await api.performProgramRequestAction(requestId, action, note, generateRequestId());
        await refreshDashboard();
    } catch (err) {
        showErrorAlert(err);
    } finally {
        showSavingBadge(false);
    }
}
