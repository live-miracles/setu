import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml, formatRosterSchedule } from '../ui/format';
import { icon } from '../ui/icons';
import { canApprove } from '../workflows';

const SHIFT_NAME_OTHER = 'Other';
const CREATE_SHIFT_MODAL_ID = 'create-shift-modal';
const OPEN_SHIFT_MODAL_BTN_ID = 'open-create-shift-modal';
const CANCEL_SHIFT_MODAL_BTN_ID = 'cancel-create-shift-modal';
const CREATE_SHIFT_FORM_ID = 'create-shift-form';
const SHIFT_NAME_PRESET_SELECT_ID = 'shift-name-preset';
const SHIFT_NAME_CUSTOM_WRAP_ID = 'shift-name-custom-wrap';
const SHIFT_NAME_CUSTOM_INPUT_ID = 'shift-name-custom';
const CREATE_SHIFT_MODAL_TITLE_ID = 'create-shift-modal-title';
const CREATE_SHIFT_SUBMIT_BTN_ID = 'create-shift-submit';

function renderRosterTable(rosters: RosterDTO[], canSchedule: boolean): string {
    const sortedRosters = [...rosters].sort(
        (a, b) =>
            a.StartDate.localeCompare(b.StartDate) ||
            (a.StartTime || '00:00').localeCompare(b.StartTime || '00:00') ||
            a.Name.localeCompare(b.Name) ||
            a.userName.localeCompare(b.userName),
    );

    return `
    <div class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title text-base">Roster</h2>
          ${canSchedule ? `<button type="button" id="${OPEN_SHIFT_MODAL_BTN_ID}" class="btn btn-primary btn-sm">${icon('plus', 'size-4')} Schedule a shift</button>` : ''}
        </div>
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead><tr>
              <th>Date</th><th>Shift</th><th>Time</th><th>Assignee</th>
              ${canSchedule ? '<th class="text-right">Actions</th>' : ''}
            </tr></thead>
            <tbody>
              ${
                  sortedRosters.length
                      ? sortedRosters
                            .map((roster) => {
                                const schedule = formatRosterSchedule(roster);
                                const [date, time] = schedule.split(' · ');
                                return `<tr>
                    <td class="whitespace-nowrap">${escapeHtml(date)}</td>
                    <td class="font-medium">${escapeHtml(roster.Name)}</td>
                    <td class="whitespace-nowrap text-sm text-base-content/70">${escapeHtml(time || 'All day')}</td>
                    <td>${escapeHtml(roster.UserId ? roster.userName : 'Unassigned')}</td>
                    ${
                        canSchedule
                            ? `<td class="whitespace-nowrap text-right">
                      <button type="button" class="btn btn-ghost btn-xs" data-roster-edit="${escapeHtml(roster.Id)}">${icon('edit', 'size-3.5')} Edit</button>
                      <button type="button" class="btn btn-ghost btn-xs text-error" data-roster-delete="${escapeHtml(roster.Id)}">${icon('trash', 'size-3.5')} Delete</button>
                    </td>`
                            : ''
                    }
                  </tr>`;
                            })
                            .join('')
                      : `<tr><td colspan="${canSchedule ? 5 : 4}" class="py-10 text-center text-base-content/60">No roster entries yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function wireRosterTable(
    rosters: RosterDTO[],
    openEditShiftModal: ((roster: RosterDTO) => void) | null,
): void {
    document.querySelectorAll<HTMLButtonElement>('[data-roster-edit]').forEach((button) => {
        button.addEventListener('click', () => {
            const roster = rosters.find((entry) => entry.Id === button.dataset.rosterEdit);
            if (roster && openEditShiftModal) openEditShiftModal(roster);
        });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-roster-delete]').forEach((button) => {
        button.addEventListener('click', async () => {
            const roster = rosters.find((entry) => entry.Id === button.dataset.rosterDelete);
            if (!roster) return;
            const who = roster.UserId ? roster.userName : 'this assignee';
            if (!confirm(`Delete the "${roster.Name}" shift for ${who}? This can't be undone.`))
                return;
            try {
                showSavingBadge(true);
                await api.deleteRoster(roster.Id, generateRequestId());
                await refreshDashboard();
            } catch (err) {
                showErrorAlert(err);
            } finally {
                showSavingBadge(false);
            }
        });
    });
}

export async function renderRoster(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const canSchedule = canApprove(dashboard.me);
    const users = canSchedule ? await api.listUsers() : [];

    container.innerHTML = `
    <section class="space-y-6">
      ${renderRosterTable(dashboard.upcomingRosters, canSchedule)}
    </section>
    ${canSchedule ? renderCreateShiftModal(users, dashboard.shiftPresets) : ''}`;

    const openEditShiftModal = canSchedule ? wireCreateShiftForm() : null;
    wireRosterTable(dashboard.upcomingRosters, openEditShiftModal);
}

function renderCreateShiftModal(users: UserDTO[], shiftPresets: ShiftPreset[]): string {
    return `
    <dialog id="${CREATE_SHIFT_MODAL_ID}" class="modal">
      <div class="modal-box w-11/12 max-w-3xl">
        <h3 id="${CREATE_SHIFT_MODAL_TITLE_ID}" class="flex items-center gap-2 text-lg font-bold">${icon('plus', 'size-5 text-primary')} Schedule a shift</h3>
        <form id="${CREATE_SHIFT_FORM_ID}" class="mt-4">
          <fieldset class="fieldset">
            <div class="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <div>
                <label class="label" for="shift-assignee">Assignee</label>
                <select id="shift-assignee" name="userId" class="select w-full" required>
                  <option value="" disabled selected>Select a team member</option>
                  ${[...users]
                      .sort((a, b) => a.Name.localeCompare(b.Name))
                      .map(
                          (u) =>
                              `<option value="${escapeHtml(u.Email)}">${escapeHtml(u.Name)} (${escapeHtml(u.Email)})</option>`,
                      )
                      .join('')}
                </select>
              </div>
              <div>
                <label class="label" for="${SHIFT_NAME_PRESET_SELECT_ID}">Shift name</label>
                <select id="${SHIFT_NAME_PRESET_SELECT_ID}" name="shiftNamePreset" class="select w-full" required>
                  ${[...shiftPresets]
                      .sort((a, b) => a.Name.localeCompare(b.Name))
                      .map(
                          (p) =>
                              `<option value="${escapeHtml(p.Name)}" data-start-time="${escapeHtml(p.DefaultStartTime)}" data-end-time="${escapeHtml(p.DefaultEndTime)}">${escapeHtml(p.Name)}</option>`,
                      )
                      .join('')}
                  <option value="${SHIFT_NAME_OTHER}">Other…</option>
                </select>
              </div>
              <div id="${SHIFT_NAME_CUSTOM_WRAP_ID}" class="hidden">
                <label class="label" for="${SHIFT_NAME_CUSTOM_INPUT_ID}">Custom shift name</label>
                <input id="${SHIFT_NAME_CUSTOM_INPUT_ID}" name="shiftNameCustom" type="text" class="input w-full" placeholder="e.g. Overnight standby" />
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-4">
              <div><label class="label" for="shift-start-date">Start date</label><input id="shift-start-date" name="startDate" type="date" class="input w-full" required /></div>
              <div><label class="label" for="shift-end-date">End date</label><input id="shift-end-date" name="endDate" type="date" class="input w-full" required /></div>
              <div><label class="label" for="shift-start-time">Start time <span class="text-base-content/50">(optional)</span></label><input id="shift-start-time" name="startTime" type="time" class="input w-full" /></div>
              <div><label class="label" for="shift-end-time">End time <span class="text-base-content/50">(optional)</span></label><input id="shift-end-time" name="endTime" type="time" class="input w-full" /></div>
            </div>
          </fieldset>
          <div class="modal-action">
            <button type="button" id="${CANCEL_SHIFT_MODAL_BTN_ID}" class="btn btn-ghost">Cancel</button>
            <button type="submit" id="${CREATE_SHIFT_SUBMIT_BTN_ID}" class="btn btn-primary">Create shift</button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>`;
}

function wireCreateShiftForm(): (roster: RosterDTO) => void {
    const modal = document.getElementById(CREATE_SHIFT_MODAL_ID) as HTMLDialogElement;
    const openBtn = document.getElementById(OPEN_SHIFT_MODAL_BTN_ID);
    const cancelBtn = document.getElementById(CANCEL_SHIFT_MODAL_BTN_ID);
    const form = document.getElementById(CREATE_SHIFT_FORM_ID) as HTMLFormElement;
    const modalTitle = document.getElementById(CREATE_SHIFT_MODAL_TITLE_ID) as HTMLElement;
    const submitBtn = document.getElementById(CREATE_SHIFT_SUBMIT_BTN_ID) as HTMLButtonElement;
    const assigneeSelect = document.getElementById('shift-assignee') as HTMLSelectElement;
    const presetSelect = document.getElementById(SHIFT_NAME_PRESET_SELECT_ID) as HTMLSelectElement;
    const customWrap = document.getElementById(SHIFT_NAME_CUSTOM_WRAP_ID) as HTMLElement;
    const customInput = document.getElementById(SHIFT_NAME_CUSTOM_INPUT_ID) as HTMLInputElement;
    const startTimeInput = document.getElementById('shift-start-time') as HTMLInputElement;
    const endTimeInput = document.getElementById('shift-end-time') as HTMLInputElement;
    const startDateInput = document.getElementById('shift-start-date') as HTMLInputElement;
    const endDateInput = document.getElementById('shift-end-date') as HTMLInputElement;
    let editingId: string | null = null;

    const setCreateMode = (): void => {
        editingId = null;
        modalTitle.innerHTML = `${icon('plus', 'size-5 text-primary')} Schedule a shift`;
        submitBtn.textContent = 'Create shift';
    };

    const syncEndDateMin = (): void => {
        endDateInput.min = startDateInput.value;
        if (
            startDateInput.value &&
            endDateInput.value &&
            endDateInput.value < startDateInput.value
        ) {
            endDateInput.value = startDateInput.value;
        }
    };
    startDateInput.addEventListener('change', syncEndDateMin);

    const syncCustomNameVisibility = (): void => {
        const isOther = presetSelect.value === SHIFT_NAME_OTHER;
        customWrap.classList.toggle('hidden', !isOther);
        customInput.required = isOther;
    };
    const prefillDefaultTimes = (): void => {
        if (presetSelect.value === SHIFT_NAME_OTHER) return;
        const selected = presetSelect.selectedOptions[0];
        if (!selected) return;
        startTimeInput.value = selected.dataset.startTime || '';
        endTimeInput.value = selected.dataset.endTime || '';
    };
    presetSelect.addEventListener('change', () => {
        syncCustomNameVisibility();
        prefillDefaultTimes();
    });

    openBtn?.addEventListener('click', () => {
        form.reset();
        setCreateMode();
        syncCustomNameVisibility();
        prefillDefaultTimes();
        syncEndDateMin();
        modal.showModal();
    });
    cancelBtn?.addEventListener('click', () => modal.close());

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const preset = String(data.get('shiftNamePreset'));
        const input = {
            startDate: String(data.get('startDate')),
            endDate: String(data.get('endDate')),
            startTime: String(data.get('startTime') || ''),
            endTime: String(data.get('endTime') || ''),
            name:
                preset === SHIFT_NAME_OTHER
                    ? String(data.get('shiftNameCustom') || '').trim()
                    : preset,
            userId: String(data.get('userId')),
        };

        try {
            showSavingBadge(true);
            if (editingId) await api.updateRoster(editingId, input, generateRequestId());
            else await api.createRoster(input, generateRequestId());
            modal.close();
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });

    return (roster: RosterDTO): void => {
        editingId = roster.Id;
        modalTitle.innerHTML = `${icon('edit', 'size-5 text-primary')} Edit shift`;
        submitBtn.textContent = 'Save changes';
        assigneeSelect.value = roster.UserId;
        const matchesPreset = Array.from(presetSelect.options).some((o) => o.value === roster.Name);
        presetSelect.value = matchesPreset ? roster.Name : SHIFT_NAME_OTHER;
        customInput.value = matchesPreset ? '' : roster.Name;
        syncCustomNameVisibility();
        startDateInput.value = roster.StartDate;
        endDateInput.value = roster.EndDate;
        syncEndDateMin();
        startTimeInput.value = roster.StartTime;
        endTimeInput.value = roster.EndTime;
        modal.showModal();
    };
}
