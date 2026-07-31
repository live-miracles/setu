// Mandatory anywhere untrusted strings (ticket titles/descriptions/comments,
// purposes, admin notes, names) get interpolated into innerHTML-built
// templates — fixes a known XSS gap in the multi-lang-qa reference pattern
// rather than reproducing it.
function escapeHtml(value: unknown): string {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function generateRequestId(): string {
    const cryptoObj = (window as any).crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    return 'req-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

const MONTH_SHORT_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

// Formats a plain 'YYYY-MM-DD' string without going through Date/timezone
// conversion, which would risk shifting the displayed day for viewers west
// of UTC.
function formatDateOnly(dateStr: string): string {
    const parts = (dateStr || '').split('-');
    if (parts.length !== 3) return dateStr || '';
    const [year, month, day] = parts;
    const monthIdx = Number(month) - 1;
    if (monthIdx < 0 || monthIdx > 11 || isNaN(Number(day))) return dateStr;
    return `${MONTH_SHORT_NAMES[monthIdx]} ${Number(day)}, ${year}`;
}

function formatTimeOfDay(time: string): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatShiftSchedule(shift: {
    StartDate: string;
    EndDate: string;
    StartTime: string;
    EndTime: string;
}): string {
    const dateLabel =
        shift.StartDate === shift.EndDate
            ? formatDateOnly(shift.StartDate)
            : `${formatDateOnly(shift.StartDate)} – ${formatDateOnly(shift.EndDate)}`;
    const startTime = formatTimeOfDay(shift.StartTime);
    const endTime = formatTimeOfDay(shift.EndTime);
    const timeLabel = startTime && endTime ? `${startTime} – ${endTime}` : startTime || endTime;
    return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

function isRequestOverdue(request: InventoryRequestDTO): boolean {
    if (request.Status !== 'issued' || !request.ToDate) return false;
    return new Date(request.ToDate).getTime() < Date.now();
}

function showSavingBadge(saving: boolean): void {
    const badge = document.getElementById('saving-badge');
    if (badge) badge.classList.toggle('hidden', !saving);
}

function showErrorAlert(error: unknown): void {
    const message =
        error instanceof Error
            ? error.message
            : String((error as any)?.message || error || 'Something went wrong.');
    const container = document.getElementById('error-toast');
    if (!container) {
        window.alert(message);
        return;
    }
    const textEl = container.querySelector('[data-error-text]');
    if (textEl) textEl.textContent = message;
    else container.textContent = message;
    container.classList.remove('hidden');
    window.setTimeout(() => container.classList.add('hidden'), 5000);
}

function namePill(name: string): string {
    return `<span class="badge badge-ghost badge-sm font-normal">${escapeHtml(name)}</span>`;
}

// Cross-section links rendered inside a section's own innerHTML (e.g. "View
// roster" on Home) aren't covered by 12-main.ts's one-time boot-time
// wireNav() pass, since that content is replaced on every render. Each
// render*.ts function that includes such a link calls this after setting
// innerHTML.
function wireInternalNavLinks(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-nav-section]').forEach((el) => {
        el.addEventListener('click', () => navigateTo(el.dataset.navSection as SectionKey));
    });
}

// ---------------------------------------------------------------------------
// Icons — small hand-authored line-icon set (no external icon font/CDN, kept
// self-contained per the project's zero-runtime-dependency build). Every
// icon shares the same stroke weight/cap style so they read as one system.
// ---------------------------------------------------------------------------

type IconName =
    | 'home'
    | 'calendar'
    | 'box'
    | 'ticket'
    | 'user'
    | 'shield'
    | 'plus'
    | 'external'
    | 'inbox'
    | 'alert'
    | 'chevronDown'
    | 'pin';

const ICON_PATHS: Record<IconName, string> = {
    home: '<path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />',
    calendar:
        '<rect x="4" y="5" width="16" height="15" rx="2" /><line x1="4" y1="9" x2="20" y2="9" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />',
    box: '<path d="M3.5 8 12 4l8.5 4L12 12 3.5 8Z" /><path d="M3.5 8v8L12 20l8.5-4V8" /><path d="M12 12v8" />',
    ticket: '<rect x="3" y="6" width="18" height="12" rx="2" /><line x1="9" y1="6" x2="9" y2="18" stroke-dasharray="2.2 2.2" />',
    user: '<circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3.2-6 7-6s7 2.5 7 6" />',
    shield: '<path d="M12 3.5 5 6v5.5c0 5 3 8 7 9 4-1 7-4 7-9V6l-7-2.5Z" /><path d="M9 12l2 2 4-4" />',
    plus: '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />',
    external:
        '<path d="M14 4h6v6" /><line x1="20" y1="4" x2="10" y2="14" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />',
    inbox: '<path d="M4 12h4l2 3h4l2-3h4" /><path d="M4 12 6 5h12l2 7" /><path d="M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />',
    alert: '<path d="M12 4 3 20h18L12 4Z" /><line x1="12" y1="10" x2="12" y2="13.5" /><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" />',
    chevronDown: '<polyline points="6 9 12 15 18 9" />',
    pin: '<path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.3" />',
};

function icon(name: IconName, className = 'size-5'): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function renderSectionHeader(iconName: IconName, title: string, subtitle: string): string {
    return `
    <div class="flex items-start gap-3">
      <div class="flex size-11 shrink-0 items-center justify-center rounded-box bg-primary/10 text-primary">
        ${icon(iconName, 'size-6')}
      </div>
      <div class="min-w-0">
        <h1 class="text-xl font-bold tracking-tight">${escapeHtml(title)}</h1>
        <p class="text-sm text-base-content/60">${escapeHtml(subtitle)}</p>
      </div>
    </div>`;
}

function renderEmptyState(iconName: IconName, message: string): string {
    return `
    <div class="flex flex-col items-center justify-center gap-2 rounded-box border border-dashed border-base-300 py-10 text-center text-base-content/50">
      ${icon(iconName, 'size-7 opacity-60')}
      <p class="text-sm">${escapeHtml(message)}</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Status/priority -> color mapping, kept in one place so every section reads
// the same lifecycle state the same way.
// ---------------------------------------------------------------------------

const INVENTORY_REQUEST_STATUS_BADGE: Record<InventoryRequestStatus, string> = {
    draft: 'badge-ghost',
    submitted: 'badge-soft badge-warning',
    approved: 'badge-soft badge-success',
    issued: 'badge-soft badge-info',
    returned: 'badge-soft badge-success',
    closed: 'badge-ghost',
    rejected: 'badge-soft badge-error',
    cancelled: 'badge-ghost',
};

const INVENTORY_REQUEST_STATUS_ACCENT: Record<InventoryRequestStatus, string> = {
    draft: 'border-base-300',
    submitted: 'border-warning',
    approved: 'border-success',
    issued: 'border-info',
    returned: 'border-success',
    closed: 'border-base-300',
    rejected: 'border-error',
    cancelled: 'border-base-300',
};

const TICKET_STATUS_BADGE: Record<TicketStatus, string> = {
    unassigned: 'badge-soft badge-warning',
    pending: 'badge-soft badge-info',
    closed: 'badge-ghost',
};

const TICKET_STATUS_ACCENT: Record<TicketStatus, string> = {
    unassigned: 'border-warning',
    pending: 'border-info',
    closed: 'border-base-300',
};

const TICKET_PRIORITY_BADGE: Record<TicketPriority, string> = {
    low: 'badge-ghost',
    medium: 'badge-soft badge-warning',
    high: 'badge-soft badge-error',
};

const PROFILE_STATUS_BADGE: Record<ProfileStatus, string> = {
    invited: 'badge-soft badge-warning',
    active: 'badge-soft badge-success',
    disabled: 'badge-soft badge-error',
};

const INVENTORY_REQUEST_ACTION_BTN: Record<InventoryRequestAction, string> = {
    submit: 'btn-primary btn-soft',
    approve: 'btn-success btn-soft',
    reject: 'btn-error btn-soft',
    issue: 'btn-info btn-soft',
    return: 'btn-success btn-soft',
    cancel: 'btn-ghost',
    close: 'btn-ghost',
};

const TICKET_ACTION_BTN: Record<TicketAction, string> = {
    assign: 'btn-primary btn-soft',
    close: 'btn-success btn-soft',
    reopen: 'btn-ghost',
};

function stockLevelClass(available: number, total: number): { bar: string; text: string } {
    if (total <= 0) return { bar: 'progress-neutral', text: 'text-base-content/50' };
    const ratio = available / total;
    if (ratio <= 0.3) return { bar: 'progress-error', text: 'text-error' };
    if (ratio <= 0.6) return { bar: 'progress-warning', text: 'text-warning' };
    return { bar: 'progress-success', text: 'text-success' };
}

function timeAgo(iso: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const seconds = Math.round((Date.now() - then) / 1000);
    const units: [string, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];
    for (const [label, secondsInUnit] of units) {
        const value = Math.floor(Math.abs(seconds) / secondsInUnit);
        if (value >= 1) {
            const suffix = seconds >= 0 ? 'ago' : 'from now';
            return `${value} ${label}${value === 1 ? '' : 's'} ${suffix}`;
        }
    }
    return 'just now';
}

const SYSTEM_COMMENT_AUTHOR_ID = 'system';

function renderCommentLine(comment: CommentDTO): string {
    if (comment.AuthorId === SYSTEM_COMMENT_AUTHOR_ID) {
        return `<div class="italic text-base-content/50">${escapeHtml(comment.Message)}</div>`;
    }
    return `<div><span class="font-medium">${escapeHtml(comment.authorName)}</span> <span class="text-base-content/70">${escapeHtml(comment.Message)}</span></div>`;
}
