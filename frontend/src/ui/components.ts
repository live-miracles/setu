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

export function renderSectionHeader(iconName: IconName, title: string, subtitle: string): string {
    return `
    <div class="section-heading">
      <span class="section-index" aria-hidden="true">${SECTION_INDEX[iconName] || '—'}</span>
      <div class="min-w-0">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
    </div>`;
}

export function renderEmptyState(iconName: IconName, message: string): string {
    return `
    <div class="setu-empty-state flex flex-col items-center justify-center gap-2 border-y border-dashed border-base-300 py-10 text-center text-base-content/50">
      ${icon(iconName, 'size-7 opacity-60')}
      <p class="text-sm">${escapeHtml(message)}</p>
    </div>`;
}

export function renderCommentLine(comment: CommentDTO): string {
    return `<div><span class="font-medium">${escapeHtml(comment.userName)}</span> <span class="text-base-content/70">${escapeHtml(comment.Message)}</span></div>`;
}
