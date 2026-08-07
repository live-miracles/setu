import { escapeHtml, formatDateTime } from './format';
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

export function renderWorkbenchHeader(title: string, actions = ''): string {
    return `<div class="workbench-header">${actions}<h1>${escapeHtml(title)}</h1></div>`;
}

export function renderEmptyState(iconName: IconName, message: string): string {
    return `
    <div class="setu-empty-state flex flex-col items-center justify-center gap-2 border-y border-dashed border-base-300 py-10 text-center text-base-content/50">
      ${icon(iconName, 'size-7 opacity-60')}
      <p class="text-sm">${escapeHtml(message)}</p>
    </div>`;
}

export function renderCommentLine(comment: CommentDTO): string {
    const timestamp = formatDateTime(comment.Timestamp);
    return `<div>
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="font-medium">${escapeHtml(comment.userName)}</span>
        ${timestamp ? `<time class="text-xs text-base-content/45" datetime="${escapeHtml(comment.Timestamp)}">${escapeHtml(timestamp)}</time>` : ''}
      </div>
      <div class="text-base-content/70">${escapeHtml(comment.Message)}</div>
    </div>`;
}

export interface RequestFieldSection {
    title: string;
    rows: string[];
}

export function renderRequestDetailPage(
    headerHtml: string,
    mainHtml: string,
    asideHtml = '',
    hasActions = false,
): string {
    return `<section class="detail-page request-detail-page ${hasActions ? 'detail-page-has-actions' : ''}">
      ${headerHtml}
      <div class="request-detail-layout">
        ${mainHtml}
        ${asideHtml}
      </div>
    </section>`;
}

export function renderRequestRecordPanel(
    contentHtml: string,
    tagName: 'main' | 'form' = 'main',
    attrs = '',
): string {
    return `<${tagName} class="request-record-panel" ${attrs}>${contentHtml}</${tagName}>`;
}

export function renderRequestTitleInput(id: string, name: string, placeholder: string): string {
    return `<div class="request-record-title"><label class="sr-only" for="${escapeHtml(id)}">${escapeHtml(placeholder)}</label><input id="${escapeHtml(id)}" name="${escapeHtml(name)}" class="request-title-input" placeholder="${escapeHtml(placeholder)}" required /></div>`;
}

export function renderRequestDisplayTitle(title: string): string {
    return `<h2 class="request-display-title">${escapeHtml(title)}</h2>`;
}

export function renderRequestFieldGrid(sections: RequestFieldSection[]): string {
    return `<div class="request-record-grid">${sections
        .map(
            (section) =>
                `<section><h2>${escapeHtml(section.title)}</h2>${section.rows.join('')}</section>`,
        )
        .join('')}</div>`;
}

export function renderRequestEditableField(label: string, controlHtml: string): string {
    return `<label class="request-field"><span>${escapeHtml(label)}</span>${controlHtml}</label>`;
}

export function renderRequestReadonlyFields(rows: { label: string; valueHtml: string }[]): string {
    return `<dl class="request-readonly-fields">${rows
        .map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${row.valueHtml}</dd></div>`)
        .join('')}</dl>`;
}

export function renderRequesterField(options: {
    selectId: string;
    users: UserDTO[];
    selectedEmail: string;
    requesterName: string;
    editable: boolean;
    canEditRequester: boolean;
}): string {
    if (options.editable && options.canEditRequester) {
        return renderRequestEditableField(
            'Requested by',
            `<select id="${escapeHtml(options.selectId)}" name="userId" class="select select-sm" required>${options.users
                .map(
                    (user) =>
                        `<option value="${escapeHtml(user.Email)}" ${user.Email === options.selectedEmail ? 'selected' : ''}>${escapeHtml(user.Name)} (${escapeHtml(user.Email)})</option>`,
                )
                .join('')}</select>`,
        );
    }
    return `${renderRequestReadonlyFields([
        { label: 'Requested by', valueHtml: escapeHtml(options.requesterName) },
    ])}${options.editable ? `<input type="hidden" name="userId" value="${escapeHtml(options.selectedEmail)}" />` : ''}`;
}

export function renderRequestLineSection(title: string, contentHtml: string, notice = ''): string {
    return `<section class="request-lines-panel">
      <div class="request-tabs"><span>${escapeHtml(title)}</span></div>
      ${notice ? `<div class="request-line-notice">${escapeHtml(notice)}</div>` : ''}
      ${contentHtml}
    </section>`;
}

export function renderRequestActivityPanel(options: {
    comments?: CommentDTO[];
    createMode?: boolean;
    commentFormId?: string;
    emptyMessage?: string;
}): string {
    const createMode = Boolean(options.createMode);
    const canComment = !createMode && Boolean(options.commentFormId);
    const content = createMode
        ? `<div class="request-activity-empty"><strong>New request</strong><span>${escapeHtml(options.emptyMessage || 'Activity will appear here after this record is saved.')}</span></div>`
        : (options.comments || []).map(renderCommentLine).join('') ||
          `<p class="text-sm text-base-content/50">${escapeHtml(options.emptyMessage || 'No updates yet.')}</p>`;
    return `<aside class="request-activity-panel">
      <div class="request-activity-timeline">${content}</div>
      ${
          !canComment
              ? ''
              : `<form id="${escapeHtml(options.commentFormId)}" class="request-comment-form"><input name="message" class="input input-sm flex-1" placeholder="Add a comment" /><button class="btn btn-sm" type="submit">Send</button></form>`
      }
    </aside>`;
}

interface DetailCommandHeaderOptions {
    backButtonId: string;
    backLabel: string;
    eyebrow: string;
    reference: string;
    title: string;
    nextStatuses?: string[];
    statusSteps?: { label: string; active: boolean; action?: string }[];
    topActionsHtml?: string;
    actionsHtml?: string;
}

export function renderDetailCommandHeader(options: DetailCommandHeaderOptions): string {
    const statusSteps = options.statusSteps?.length
        ? `<div class="detail-status-track" aria-label="Status progress">${options.statusSteps
              .map((step) =>
                  step.action
                      ? `<button type="button" class="${step.active ? 'active' : ''}" data-detail-action="${escapeHtml(step.action)}">${escapeHtml(step.label)}</button>`
                      : `<span class="${step.active ? 'active' : ''}">${escapeHtml(step.label)}</span>`,
              )
              .join('')}</div>`
        : '';

    return `<header class="detail-command-header">
      <div class="detail-command-meta">
        <div class="detail-command-meta-main">
          <button type="button" id="${escapeHtml(options.backButtonId)}" class="detail-command-back btn btn-ghost btn-sm">${icon('chevronLeft', 'size-4')} ${escapeHtml(options.backLabel)}</button>
          <span>${escapeHtml(options.eyebrow)} · <span class="font-mono">${escapeHtml(options.reference)}</span></span>
        </div>
        ${options.topActionsHtml ? `<div class="detail-command-top-actions">${options.topActionsHtml}</div>` : ''}
      </div>
      <div class="detail-command-main">
        <div class="detail-command-title min-w-0">
          <h1>${escapeHtml(options.title)}</h1>
        </div>
        <div class="detail-command-controls">
          ${statusSteps}
          ${options.actionsHtml ? `<div class="detail-command-actions" aria-label="Available actions">${options.actionsHtml}</div>` : ''}
        </div>
      </div>
    </header>`;
}
