import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
import { namePill, renderEmptyState, renderSectionHeader } from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { MONTH_SHORT_NAMES, escapeHtml, formatRosterSchedule } from '../ui/format';
import { icon } from '../ui/icons';
import { canApprove } from '../workflows';

const SHIFT_NAME_OTHER = 'Other';
const SHIFT_NAME_PRESETS = ['Morning', 'Evening', 'Day', 'Night', SHIFT_NAME_OTHER];

const CREATE_SHIFT_FORM_ID = 'create-shift-form';
const SHIFT_NAME_PRESET_SELECT_ID = 'shift-name-preset';
const SHIFT_NAME_CUSTOM_WRAP_ID = 'shift-name-custom-wrap';
const SHIFT_NAME_CUSTOM_INPUT_ID = 'shift-name-custom';
const ROSTER_LIST_ID = 'roster-list';

function formatDayTile(dateStr: string): { day: string; month: string } {
    const parts = (dateStr || '').split('-');
    const monthIdx = Number(parts[1]) - 1;
    if (parts.length !== 3 || monthIdx < 0 || monthIdx > 11 || isNaN(Number(parts[2]))) {
        return { day: '--', month: '' };
    }
    return { day: parts[2], month: MONTH_SHORT_NAMES[monthIdx] };
}

export async function renderRoster(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const canSchedule = canApprove(dashboard.me);
    const users = canSchedule ? await api.listUsers() : [];

    container.innerHTML = `
    <section class="space-y-6">
      ${renderSectionHeader('calendar', 'Roster', 'Plan shifts and keep the team aligned.')}
      ${canSchedule ? renderCreateShiftForm(users) : ''}
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title text-base">Shifts</h2>
          <ul id="${ROSTER_LIST_ID}" class="divide-y divide-base-200"></ul>
        </div>
      </div>
    </section>
  `;

    renderRosterList(dashboard.upcomingRosters);
    if (canSchedule) wireCreateShiftForm();
}

function renderCreateShiftForm(users: UserDTO[]): string {
    return `
    <form id="${CREATE_SHIFT_FORM_ID}" class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body gap-3">
        <h2 class="card-title text-base">${icon('plus', 'size-5 text-primary')} Schedule a shift</h2>
        <fieldset class="fieldset">
          <div class="grid gap-3 sm:grid-cols-4">
            <div>
              <label class="label" for="shift-start-date">Start date</label>
              <input id="shift-start-date" name="startDate" type="date" class="input w-full" required />
            </div>
            <div>
              <label class="label" for="shift-end-date">End date</label>
              <input id="shift-end-date" name="endDate" type="date" class="input w-full" required />
            </div>
            <div>
              <label class="label" for="shift-start-time">Start time <span class="text-base-content/50">(optional)</span></label>
              <input id="shift-start-time" name="startTime" type="time" class="input w-full" />
            </div>
            <div>
              <label class="label" for="shift-end-time">End time <span class="text-base-content/50">(optional)</span></label>
              <input id="shift-end-time" name="endTime" type="time" class="input w-full" />
            </div>
          </div>
          <div>
            <label class="label" for="${SHIFT_NAME_PRESET_SELECT_ID}">Shift name</label>
            <select id="${SHIFT_NAME_PRESET_SELECT_ID}" name="shiftNamePreset" class="select w-full" required>
              ${SHIFT_NAME_PRESETS.map((p) => `<option value="${p}">${p === SHIFT_NAME_OTHER ? 'Other…' : p}</option>`).join('')}
            </select>
          </div>
          <div id="${SHIFT_NAME_CUSTOM_WRAP_ID}" class="hidden">
            <label class="label" for="${SHIFT_NAME_CUSTOM_INPUT_ID}">Custom shift name</label>
            <input id="${SHIFT_NAME_CUSTOM_INPUT_ID}" name="shiftNameCustom" type="text" class="input w-full" placeholder="e.g. Overnight standby" />
          </div>
          <label class="label" for="shift-assignee">Assignee</label>
          <select id="shift-assignee" name="userId" class="select w-full" required>
            <option value="" disabled selected>Select a team member</option>
            ${users.map((u) => `<option value="${u.Email}">${escapeHtml(u.Name)} (${escapeHtml(u.Email)})</option>`).join('')}
          </select>
        </fieldset>
        <div>
          <button type="submit" class="btn btn-primary">Create shift</button>
        </div>
      </div>
    </form>
  `;
}

function wireCreateShiftForm(): void {
    const form = document.getElementById(CREATE_SHIFT_FORM_ID) as HTMLFormElement;
    const presetSelect = document.getElementById(SHIFT_NAME_PRESET_SELECT_ID) as HTMLSelectElement;
    const customWrap = document.getElementById(SHIFT_NAME_CUSTOM_WRAP_ID) as HTMLElement;
    const customInput = document.getElementById(SHIFT_NAME_CUSTOM_INPUT_ID) as HTMLInputElement;

    const syncCustomNameVisibility = (): void => {
        const isOther = presetSelect.value === SHIFT_NAME_OTHER;
        customWrap.classList.toggle('hidden', !isOther);
        customInput.required = isOther;
    };
    presetSelect.addEventListener('change', syncCustomNameVisibility);
    syncCustomNameVisibility();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const preset = String(data.get('shiftNamePreset'));
        const shiftName =
            preset === SHIFT_NAME_OTHER ? String(data.get('shiftNameCustom') || '').trim() : preset;

        try {
            showSavingBadge(true);
            await api.createRoster(
                {
                    startDate: String(data.get('startDate')),
                    endDate: String(data.get('endDate')),
                    startTime: String(data.get('startTime') || ''),
                    endTime: String(data.get('endTime') || ''),
                    name: shiftName,
                    userId: String(data.get('userId')),
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

function renderRosterList(rosters: RosterDTO[]): void {
    const list = document.getElementById(ROSTER_LIST_ID);
    if (!list) return;
    list.innerHTML =
        rosters.length === 0
            ? `<li class="py-2">${renderEmptyState('calendar', 'No shifts scheduled.')}</li>`
            : rosters
                  .map((roster) => {
                      const tile = formatDayTile(roster.StartDate);
                      return `
              <li class="flex items-start gap-4 py-3">
                <div class="flex w-14 shrink-0 flex-col items-center justify-center rounded-box bg-base-200 py-1.5">
                  <span class="text-lg font-bold leading-none">${tile.day}</span>
                  <span class="text-xs uppercase text-base-content/60">${tile.month}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium">${escapeHtml(roster.Name)}</span>
                    <span class="text-sm text-base-content/60">${formatRosterSchedule(roster)}</span>
                  </div>
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    ${roster.UserId ? namePill(roster.userName) : '<span class="text-sm text-base-content/50">Unassigned</span>'}
                  </div>
                </div>
              </li>`;
                  })
                  .join('');
}
