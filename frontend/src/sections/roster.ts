import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
import { renderSectionHeader } from '../ui/components';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml, formatTimeOfDay } from '../ui/format';
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

const CALENDAR_PREV_BTN_ID = 'roster-cal-prev';
const CALENDAR_NEXT_BTN_ID = 'roster-cal-next';
const CALENDAR_LABEL_ID = 'roster-cal-label';
const CALENDAR_GRID_ID = 'roster-cal-grid';
const CALENDAR_VIEW_MONTH_BTN_ID = 'roster-cal-view-month';
const CALENDAR_VIEW_WEEK_BTN_ID = 'roster-cal-view-week';
const CALENDAR_WEEK_SCROLL_ID = 'roster-cal-week-scroll';

type CalendarMode = 'month' | 'week';

const WEEKDAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Pixel height of one hour row in the week time-grid - tall enough that a
// half-hour shift is still readable, short enough that a 24h day fits a
// reasonable scroll.
const WEEK_HOUR_HEIGHT_PX = 36;

// Fallback bottom gap if #app-content's own padding can't be read (see
// calendarBottomReserve) - the grid content is let to stretch down to just
// short of the viewport bottom, so the card fills the remaining page height
// instead of leaving a dead gap under a fixed-size grid.
const CALENDAR_BOTTOM_GAP_FALLBACK_PX = 24;
const CALENDAR_MIN_CONTENT_HEIGHT_PX = 320;

let calendarResizeHandler: (() => void) | null = null;

// A day's shift, after roster date ranges are expanded one entry per date and
// blank times default to the full day (00:00-24:00). Rosters that land on
// the same date with the same name and time window collapse into a single
// block, one shared entry per assignee.
interface ShiftBlock {
    name: string;
    startTime: string;
    endTime: string;
    userNames: string[];
}

// Cycled by a hash of the shift name so the same name always lands on the
// same color across the calendar, without maintaining an explicit map.
const SHIFT_BLOCK_PALETTE = [
    'bg-primary/15 text-primary',
    'bg-secondary/15 text-secondary',
    'bg-accent/15 text-accent',
    'bg-info/15 text-info',
    'bg-success/15 text-success',
    'bg-warning/15 text-warning',
];

function shiftBlockClass(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return SHIFT_BLOCK_PALETTE[hash % SHIFT_BLOCK_PALETTE.length];
}

// Parses a 'YYYY-MM-DD' string into a local-midnight Date. Never round-trip
// through toISOString/UTC parsing here - that shifts the calendar date by a
// day for viewers west of UTC.
function parseDateOnly(dateStr: string): Date | null {
    const parts = (dateStr || '').split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function toDateKey(d: Date): string {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

function eachDateKeyInRange(startDate: string, endDate: string): string[] {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return [];
    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        dates.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

function buildShiftBlocksByDate(rosters: RosterDTO[]): Map<string, ShiftBlock[]> {
    const byDate = new Map<string, Map<string, ShiftBlock>>();
    rosters.forEach((roster) => {
        const startTime = roster.StartTime || '00:00';
        const endTime = roster.EndTime || '24:00';
        const userName = roster.UserId ? roster.userName : 'Unassigned';
        eachDateKeyInRange(roster.StartDate, roster.EndDate).forEach((date) => {
            const key = `${roster.Name}|${startTime}|${endTime}`;
            let dayBlocks = byDate.get(date);
            if (!dayBlocks) {
                dayBlocks = new Map();
                byDate.set(date, dayBlocks);
            }
            let block = dayBlocks.get(key);
            if (!block) {
                block = { name: roster.Name, startTime, endTime, userNames: [] };
                dayBlocks.set(key, block);
            }
            if (block.userNames.indexOf(userName) === -1) block.userNames.push(userName);
        });
    });

    const result = new Map<string, ShiftBlock[]>();
    byDate.forEach((dayBlocks, date) => {
        result.set(
            date,
            Array.from(dayBlocks.values()).sort(
                (a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name),
            ),
        );
    });
    return result;
}

function monthLabel(year: number, month: number): string {
    return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function startOfWeek(d: Date): Date {
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    return start;
}

function formatShortDate(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function weekRangeLabel(weekStart: Date): string {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}, ${weekEnd.getFullYear()}`;
}

function renderDayCell(
    cursor: Date,
    shiftsByDate: Map<string, ShiftBlock[]>,
    dim: boolean,
    todayKey: string,
): string {
    const dateKey = toDateKey(cursor);
    const isToday = dateKey === todayKey;
    const blocks = shiftsByDate.get(dateKey) || [];
    return `
      <div class="h-full overflow-y-auto rounded-box border border-base-200 p-1.5 ${dim ? 'bg-base-200/40' : 'bg-base-100'}">
        <div class="text-xs font-medium ${
            isToday
                ? 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-content'
                : dim
                  ? 'text-base-content/30'
                  : 'text-base-content/70'
        }">${cursor.getDate()}</div>
        <div class="mt-1 space-y-1">
          ${blocks
              .map(
                  (b) => `
            <div class="rounded px-1.5 py-1 text-[11px] leading-tight ${shiftBlockClass(b.name)}">
              <div class="truncate"><span class="font-semibold">${escapeHtml(b.name)}</span> <span class="opacity-80">${formatTimeOfDay(b.startTime)}–${formatTimeOfDay(b.endTime)}</span></div>
              <div class="truncate">${escapeHtml(b.userNames.join(', '))}</div>
            </div>`,
              )
              .join('')}
        </div>
      </div>`;
}

function renderCalendarWeekHeader(cells: string[]): string {
    return `
    <div class="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-base-content/50">
      ${WEEKDAY_SHORT_NAMES.map((d) => `<div class="py-1">${d}</div>`).join('')}
    </div>
    <div class="grid grid-cols-7 grid-rows-6 gap-1">${cells.join('')}</div>`;
}

function renderMonthGrid(shiftsByDate: Map<string, ShiftBlock[]>, year: number, month: number): string {
    const gridStart = new Date(year, month, 1);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const todayKey = toDateKey(new Date());

    const cells: string[] = [];
    const cursor = new Date(gridStart);
    for (let i = 0; i < 42; i++) {
        cells.push(renderDayCell(cursor, shiftsByDate, cursor.getMonth() !== month, todayKey));
        cursor.setDate(cursor.getDate() + 1);
    }
    return renderCalendarWeekHeader(cells);
}

function minutesOfDay(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function formatHourLabel(hour: number): string {
    return new Date(2000, 0, 1, hour, 0).toLocaleTimeString(undefined, { hour: 'numeric' });
}

interface PositionedShiftBlock {
    block: ShiftBlock;
    top: number;
    height: number;
    col: number;
    cols: number;
}

// Greedy column assignment (the classic calendar-event-layout sweep): each
// block reuses the first column whose last event has already ended, so
// blocks that never overlap end up sharing column 0 at full width, and
// `cols` only grows for genuine same-time overlaps.
function layoutDayBlocks(blocks: ShiftBlock[]): PositionedShiftBlock[] {
    const sorted = [...blocks].sort((a, b) => minutesOfDay(a.startTime) - minutesOfDay(b.startTime));
    const columnEnds: number[] = [];
    const positioned: PositionedShiftBlock[] = sorted.map((block) => {
        const start = minutesOfDay(block.startTime);
        const end = Math.max(minutesOfDay(block.endTime), start + 15);
        let col = columnEnds.findIndex((endMinute) => endMinute <= start);
        if (col === -1) {
            col = columnEnds.length;
            columnEnds.push(end);
        } else {
            columnEnds[col] = end;
        }
        return {
            block,
            top: (start / 60) * WEEK_HOUR_HEIGHT_PX,
            height: ((end - start) / 60) * WEEK_HOUR_HEIGHT_PX,
            col,
            cols: 0,
        };
    });
    const totalCols = Math.max(1, columnEnds.length);
    positioned.forEach((p) => (p.cols = totalCols));
    return positioned;
}

// Blank start/end times default to 00:00-24:00 (see buildShiftBlocksByDate) -
// that full-day span belongs in the all-day row, not stretched down the
// entire hour grid crowding out the day's actual timed shifts.
function isAllDayShiftBlock(b: ShiftBlock): boolean {
    return b.startTime === '00:00' && b.endTime === '24:00';
}

function renderWeekGrid(shiftsByDate: Map<string, ShiftBlock[]>, weekStart: Date): string {
    const todayKey = toDateKey(new Date());
    const days: Date[] = [];
    const cursor = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    const dayHeaders = days
        .map((d) => {
            const isToday = toDateKey(d) === todayKey;
            return `
        <div class="border-l border-base-200 py-1.5 text-center">
          <div class="text-xs font-semibold uppercase text-base-content/50">${WEEKDAY_SHORT_NAMES[d.getDay()]}</div>
          <div class="mt-0.5 text-sm font-medium ${isToday ? 'mx-auto flex size-6 items-center justify-center rounded-full bg-primary text-primary-content' : ''}">${d.getDate()}</div>
        </div>`;
        })
        .join('');

    const hourGutter = Array.from({ length: 24 }, (_, hour) => {
        return `
        <div class="relative border-t border-base-200 text-right" style="height:${WEEK_HOUR_HEIGHT_PX}px">
          <span class="absolute right-1 -top-2 text-[10px] text-base-content/40">${formatHourLabel(hour)}</span>
        </div>`;
    }).join('');

    const allDayByDate = days.map((d) => (shiftsByDate.get(toDateKey(d)) || []).filter(isAllDayShiftBlock));
    const allDayRow = allDayByDate.some((blocks) => blocks.length > 0)
        ? `
    <div class="flex border-b border-base-300">
      <div class="w-12 shrink-0"></div>
      <div class="grid flex-1 grid-cols-7 gap-px">
        ${allDayByDate
            .map(
                (blocks) => `
          <div class="space-y-0.5 border-l border-base-200 p-1">
            ${blocks
                .map(
                    (b) => `
              <div class="truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${shiftBlockClass(b.name)}">${escapeHtml(b.name)}${b.userNames.length ? ' · ' + escapeHtml(b.userNames.join(', ')) : ''}</div>`,
                )
                .join('')}
          </div>`,
            )
            .join('')}
      </div>
    </div>`
        : '';

    const now = new Date();
    const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * WEEK_HOUR_HEIGHT_PX;

    const dayColumns = days
        .map((d) => {
            const blocks = (shiftsByDate.get(toDateKey(d)) || []).filter((b) => !isAllDayShiftBlock(b));
            const positioned = layoutDayBlocks(blocks);
            const gridLines = Array.from(
                { length: 24 },
                () => `<div class="border-t border-base-200" style="height:${WEEK_HOUR_HEIGHT_PX}px"></div>`,
            ).join('');
            const blockEls = positioned
                .map(({ block: b, top, height, col, cols }) => {
                    const leftPct = (col / cols) * 100;
                    const widthPct = 100 / cols;
                    return `
              <div class="absolute overflow-hidden rounded px-1.5 py-1 text-[11px] leading-tight ${shiftBlockClass(b.name)}" style="top:${top}px; height:${Math.max(height, 20)}px; left:calc(${leftPct}% + 2px); width:calc(${widthPct}% - 4px);">
                <div class="truncate font-semibold">${escapeHtml(b.name)}</div>
                <div class="truncate opacity-80">${formatTimeOfDay(b.startTime)}–${formatTimeOfDay(b.endTime)}</div>
                <div class="truncate">${escapeHtml(b.userNames.join(', '))}</div>
              </div>`;
                })
                .join('');
            // The current-time line, Google Calendar-style: a dot at the
            // column's left edge and a line spanning just that one day, not
            // the whole week.
            const nowIndicator =
                toDateKey(d) === todayKey
                    ? `<div class="pointer-events-none absolute inset-x-0 z-10 flex items-center" style="top:${nowTop}px">
                  <span class="-ml-1 size-2 shrink-0 rounded-full bg-error"></span>
                  <span class="h-px w-full bg-error"></span>
                </div>`
                    : '';
            return `<div class="relative border-l border-base-200">${gridLines}${blockEls}${nowIndicator}</div>`;
        })
        .join('');

    return `
    <div class="flex border-b border-base-300">
      <div class="w-12 shrink-0"></div>
      <div class="grid flex-1 grid-cols-7">${dayHeaders}</div>
    </div>
    ${allDayRow}
    <div id="${CALENDAR_WEEK_SCROLL_ID}" class="overflow-y-auto">
      <div class="flex">
        <div class="w-12 shrink-0">${hourGutter}</div>
        <div class="grid flex-1 grid-cols-7">${dayColumns}</div>
      </div>
    </div>`;
}

// Google Calendar-style default: land with "now" a couple of hours down
// from the top, rather than scrolled to midnight.
function scrollWeekGridToDefault(): void {
    const scrollEl = document.getElementById(CALENDAR_WEEK_SCROLL_ID);
    if (!scrollEl) return;
    const now = new Date();
    const nowHour = now.getHours() + now.getMinutes() / 60;
    scrollEl.scrollTop = Math.max(0, nowHour - 2) * WEEK_HOUR_HEIGHT_PX;
}

// Stretches the calendar's grid content down to just short of the viewport
// bottom: month rows grow to fill it (grid-rows-6, set below), while the
// week view gets a max-height so it scrolls once its 24 real hours run out
// rather than stretching past them.
// #app-content already reserves bottom space of its own (pb-24 for the
// mobile dock, sm:pb-10 on desktop) - reused as the gap below the calendar
// instead of adding a second one, or the two would stack and push the page
// taller than the viewport.
function calendarBottomReserve(): number {
    const mainEl = document.getElementById('app-content');
    const paddingBottom = mainEl ? parseFloat(getComputedStyle(mainEl).paddingBottom) : NaN;
    return Number.isFinite(paddingBottom) ? paddingBottom : CALENDAR_BOTTOM_GAP_FALLBACK_PX;
}

function fitCalendarToViewport(): void {
    const gridEl = document.getElementById(CALENDAR_GRID_ID);
    if (!gridEl) return;
    // Week mode may have an all-day row before the scroll container, so it's
    // looked up by id rather than assumed to be a fixed child index.
    const weekScroll = document.getElementById(CALENDAR_WEEK_SCROLL_ID);
    const content = weekScroll || (gridEl.lastElementChild as HTMLElement | null);
    if (!content) return;

    // The card's own bottom padding/border sits below the grid content and
    // above #app-content's padding - measured live (card bottom minus content
    // bottom) rather than hardcoded, so it stays right if the card's padding
    // ever changes. It's a fixed offset regardless of content's own height,
    // so it's safe to read even mid-resize.
    const cardEl = gridEl.closest('.card') as HTMLElement | null;
    const cardBottomChrome = cardEl
        ? cardEl.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom
        : 0;

    const available = Math.max(
        CALENDAR_MIN_CONTENT_HEIGHT_PX,
        window.innerHeight - content.getBoundingClientRect().top - cardBottomChrome - calendarBottomReserve(),
    );
    if (content === weekScroll) {
        content.style.maxHeight = `${available}px`;
    } else {
        content.style.height = `${available}px`;
    }
}

function calendarLabel(anchor: Date, mode: CalendarMode): string {
    return mode === 'month'
        ? monthLabel(anchor.getFullYear(), anchor.getMonth())
        : weekRangeLabel(startOfWeek(anchor));
}

function calendarGrid(shiftsByDate: Map<string, ShiftBlock[]>, anchor: Date, mode: CalendarMode): string {
    return mode === 'month'
        ? renderMonthGrid(shiftsByDate, anchor.getFullYear(), anchor.getMonth())
        : renderWeekGrid(shiftsByDate, startOfWeek(anchor));
}

function renderCalendarCard(shiftsByDate: Map<string, ShiftBlock[]>, anchor: Date, mode: CalendarMode): string {
    return `
    <div class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title text-base">${icon('calendar', 'size-5 text-primary')} Shift calendar</h2>
          <div class="flex flex-wrap items-center gap-3">
            <div role="tablist" class="tabs tabs-box tabs-sm">
              <button id="${CALENDAR_VIEW_MONTH_BTN_ID}" type="button" role="tab" class="tab ${mode === 'month' ? 'tab-active' : ''}">Month</button>
              <button id="${CALENDAR_VIEW_WEEK_BTN_ID}" type="button" role="tab" class="tab ${mode === 'week' ? 'tab-active' : ''}">Week</button>
            </div>
            <div class="flex items-center gap-2">
              <button id="${CALENDAR_PREV_BTN_ID}" type="button" class="btn btn-ghost btn-xs" aria-label="Previous">${icon('chevronLeft', 'size-4')}</button>
              <span id="${CALENDAR_LABEL_ID}" class="min-w-36 text-center text-sm font-medium">${calendarLabel(anchor, mode)}</span>
              <button id="${CALENDAR_NEXT_BTN_ID}" type="button" class="btn btn-ghost btn-xs" aria-label="Next">${icon('chevronRight', 'size-4')}</button>
            </div>
          </div>
        </div>
        <div id="${CALENDAR_GRID_ID}">${calendarGrid(shiftsByDate, anchor, mode)}</div>
      </div>
    </div>`;
}

function wireCalendar(shiftsByDate: Map<string, ShiftBlock[]>): void {
    const today = new Date();
    const state: { anchor: Date; mode: CalendarMode } = {
        anchor: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        mode: 'month',
    };

    const rerender = (): void => {
        const label = document.getElementById(CALENDAR_LABEL_ID);
        const grid = document.getElementById(CALENDAR_GRID_ID);
        if (label) label.textContent = calendarLabel(state.anchor, state.mode);
        if (grid) grid.innerHTML = calendarGrid(shiftsByDate, state.anchor, state.mode);
        document
            .getElementById(CALENDAR_VIEW_MONTH_BTN_ID)
            ?.classList.toggle('tab-active', state.mode === 'month');
        document
            .getElementById(CALENDAR_VIEW_WEEK_BTN_ID)
            ?.classList.toggle('tab-active', state.mode === 'week');
        fitCalendarToViewport();
        if (state.mode === 'week') scrollWeekGridToDefault();
    };

    document.getElementById(CALENDAR_PREV_BTN_ID)?.addEventListener('click', () => {
        if (state.mode === 'month') {
            state.anchor.setDate(1);
            state.anchor.setMonth(state.anchor.getMonth() - 1);
        } else {
            state.anchor.setDate(state.anchor.getDate() - 7);
        }
        rerender();
    });
    document.getElementById(CALENDAR_NEXT_BTN_ID)?.addEventListener('click', () => {
        if (state.mode === 'month') {
            state.anchor.setDate(1);
            state.anchor.setMonth(state.anchor.getMonth() + 1);
        } else {
            state.anchor.setDate(state.anchor.getDate() + 7);
        }
        rerender();
    });
    document.getElementById(CALENDAR_VIEW_MONTH_BTN_ID)?.addEventListener('click', () => {
        state.mode = 'month';
        rerender();
    });
    document.getElementById(CALENDAR_VIEW_WEEK_BTN_ID)?.addEventListener('click', () => {
        state.mode = 'week';
        rerender();
    });

    // Re-fit on window resize - the previous section's listener is removed
    // first since renderRoster/wireCalendar reruns on every nav to Roster,
    // and old DOM (removed by the innerHTML replace) can't clean itself up.
    if (calendarResizeHandler) window.removeEventListener('resize', calendarResizeHandler);
    calendarResizeHandler = () => fitCalendarToViewport();
    window.addEventListener('resize', calendarResizeHandler);

    fitCalendarToViewport();
}

export async function renderRoster(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const canSchedule = canApprove(dashboard.me);
    const users = canSchedule ? await api.listUsers() : [];
    const shiftsByDate = buildShiftBlocksByDate(dashboard.upcomingRosters);
    const today = new Date();

    container.innerHTML = `
    <section class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        ${renderSectionHeader('calendar', 'Roster', 'Plan shifts and keep the team aligned.')}
        ${canSchedule ? `<button type="button" id="${OPEN_SHIFT_MODAL_BTN_ID}" class="btn btn-primary btn-sm">${icon('plus', 'size-4')} Schedule a shift</button>` : ''}
      </div>
      ${renderCalendarCard(shiftsByDate, today, 'month')}
    </section>
    ${canSchedule ? renderCreateShiftModal(users, dashboard.shiftPresets) : ''}
  `;

    if (canSchedule) wireCreateShiftForm();
    wireCalendar(shiftsByDate);
}

function renderCreateShiftModal(users: UserDTO[], shiftPresets: ShiftPreset[]): string {
    return `
    <dialog id="${CREATE_SHIFT_MODAL_ID}" class="modal">
      <div class="modal-box w-11/12 max-w-3xl">
        <h3 class="text-lg font-bold flex items-center gap-2">${icon('plus', 'size-5 text-primary')} Schedule a shift</h3>
        <form id="${CREATE_SHIFT_FORM_ID}" class="mt-4">
          <fieldset class="fieldset">
            <div class="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <div>
                <label class="label" for="shift-assignee">Assignee</label>
                <select id="shift-assignee" name="userId" class="select w-full" required>
                  <option value="" disabled selected>Select a team member</option>
                  ${users.map((u) => `<option value="${u.Email}">${escapeHtml(u.Name)} (${escapeHtml(u.Email)})</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="label" for="${SHIFT_NAME_PRESET_SELECT_ID}">Shift name</label>
                <select id="${SHIFT_NAME_PRESET_SELECT_ID}" name="shiftNamePreset" class="select w-full" required>
                  ${shiftPresets
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
          </fieldset>
          <div class="modal-action">
            <button type="button" id="${CANCEL_SHIFT_MODAL_BTN_ID}" class="btn btn-ghost">Cancel</button>
            <button type="submit" class="btn btn-primary">Create shift</button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>`;
}

function wireCreateShiftForm(): void {
    const modal = document.getElementById(CREATE_SHIFT_MODAL_ID) as HTMLDialogElement;
    const openBtn = document.getElementById(OPEN_SHIFT_MODAL_BTN_ID);
    const cancelBtn = document.getElementById(CANCEL_SHIFT_MODAL_BTN_ID);
    const form = document.getElementById(CREATE_SHIFT_FORM_ID) as HTMLFormElement;
    const presetSelect = document.getElementById(SHIFT_NAME_PRESET_SELECT_ID) as HTMLSelectElement;
    const customWrap = document.getElementById(SHIFT_NAME_CUSTOM_WRAP_ID) as HTMLElement;
    const customInput = document.getElementById(SHIFT_NAME_CUSTOM_INPUT_ID) as HTMLInputElement;
    const startTimeInput = document.getElementById('shift-start-time') as HTMLInputElement;
    const endTimeInput = document.getElementById('shift-end-time') as HTMLInputElement;

    const syncCustomNameVisibility = (): void => {
        const isOther = presetSelect.value === SHIFT_NAME_OTHER;
        customWrap.classList.toggle('hidden', !isOther);
        customInput.required = isOther;
    };
    // Picking a preset fills in its default clock-in/out so a recurring
    // shift doesn't need the same times retyped every time - presets (with
    // their default times) are managed on the Others settings page.
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
        syncCustomNameVisibility();
        prefillDefaultTimes();
        modal.showModal();
    });
    cancelBtn?.addEventListener('click', () => modal.close());

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
            modal.close();
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}
