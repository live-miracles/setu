import { escapeHtml } from './format';
import type { IconName } from './icons';
import { icon } from './icons';

// Reusable HTML fragments. Each returns a string rather than a node — the
// sections build their markup as one template literal and assign it to
// innerHTML in a single write.

export function namePill(name: string): string {
    return `<span class="badge badge-ghost badge-sm font-normal">${escapeHtml(name)}</span>`;
}

const SECTION_INDEX: Partial<Record<IconName, string>> = {
    home: '00',
    calendar: '01',
    box: '02',
    clapper: '03',
    ticket: '04',
    user: '05',
    shield: '06',
    external: '07',
};

export function renderSectionHeader(
    iconName: IconName,
    title: string,
    subtitle: string,
    actions = '',
): string {
    return `
    <div class="section-heading">
      <span class="section-index" aria-hidden="true">${SECTION_INDEX[iconName] || '—'}</span>
      <div class="min-w-0">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      ${actions ? `<div class="section-heading-actions">${actions}</div>` : ''}
    </div>`;
}

export function renderEmptyState(iconName: IconName, message: string): string {
    return `
    <div class="setu-empty-state flex flex-col items-center justify-center gap-2 border-y border-dashed border-base-300 py-10 text-center text-base-content/50">
      ${icon(iconName, 'size-7 opacity-60')}
      <p class="text-sm">${escapeHtml(message)}</p>
    </div>`;
}

export function renderPageSkeleton(label = 'Loading workspace'): string {
    return `<div class="setu-page-skeleton" role="status" aria-live="polite" aria-label="${escapeHtml(label)}">
      <span class="sr-only">${escapeHtml(label)}…</span>
      <div class="skeleton h-8 w-56"></div>
      <div class="mt-3 skeleton h-4 w-80 max-w-full"></div>
      <div class="mt-8 grid gap-4 md:grid-cols-3">
        <div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div>
      </div>
      <div class="mt-6 skeleton h-64"></div>
    </div>`;
}

export function renderCommentLine(comment: CommentDTO): string {
    return `<div><span class="font-medium">${escapeHtml(comment.userName)}</span> <span class="text-base-content/70">${escapeHtml(comment.Message)}</span></div>`;
}

interface DetailCommandHeaderOptions {
    backButtonId: string;
    backLabel: string;
    eyebrow: string;
    reference: string;
    title: string;
    statusHtml: string;
    nextStatuses?: string[];
    actionsHtml?: string;
}

export function renderDetailCommandHeader(options: DetailCommandHeaderOptions): string {
    const nextState = options.nextStatuses?.length
        ? `<span><span class="detail-state-label">Possible next</span><strong>${options.nextStatuses.map(escapeHtml).join(' / ')}</strong></span>`
        : '<span><span class="detail-state-label">Lifecycle</span><strong>Final state</strong></span>';

    return `<header class="detail-command-header">
      <button type="button" id="${escapeHtml(options.backButtonId)}" class="detail-command-back btn btn-ghost btn-sm">← ${escapeHtml(options.backLabel)}</button>
      <div class="detail-command-main">
        <div class="detail-command-title min-w-0">
          <p>${escapeHtml(options.eyebrow)} · <span class="font-mono">${escapeHtml(options.reference)}</span></p>
          <h1>${escapeHtml(options.title)}</h1>
        </div>
        <div class="detail-command-controls">
          <div class="detail-command-status">${options.statusHtml}</div>
          ${options.actionsHtml ? `<div class="detail-command-actions" aria-label="Available actions">${options.actionsHtml}</div>` : ''}
        </div>
      </div>
      <div class="detail-state-summary" aria-label="Lifecycle status">${nextState}</div>
    </header>`;
}
