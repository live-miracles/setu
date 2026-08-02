import { escapeHtml } from './format';
import type { IconName } from './icons';
import { icon } from './icons';

// Reusable HTML fragments. Each returns a string rather than a node — the
// sections build their markup as one template literal and assign it to
// innerHTML in a single write.

export function namePill(name: string): string {
    return `<span class="badge badge-ghost badge-sm font-normal">${escapeHtml(name)}</span>`;
}

export function renderSectionHeader(iconName: IconName, title: string, subtitle: string): string {
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

export function renderEmptyState(iconName: IconName, message: string): string {
    return `
    <div class="flex flex-col items-center justify-center gap-2 rounded-box border border-dashed border-base-300 py-10 text-center text-base-content/50">
      ${icon(iconName, 'size-7 opacity-60')}
      <p class="text-sm">${escapeHtml(message)}</p>
    </div>`;
}

export function renderCommentLine(comment: CommentDTO): string {
    return `<div><span class="font-medium">${escapeHtml(comment.userName)}</span> <span class="text-base-content/70">${escapeHtml(comment.Message)}</span></div>`;
}
