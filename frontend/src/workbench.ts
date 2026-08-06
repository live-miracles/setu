import {
    INVENTORY_REQUEST_QUERY_PARAM,
    PROGRAM_REQUEST_QUERY_PARAM,
    TICKET_QUERY_PARAM,
    WORKBENCH_DIRECTION_QUERY_PARAM,
    WORKBENCH_MODE_QUERY_PARAM,
    WORKBENCH_SEARCH_QUERY_PARAM,
    WORKBENCH_SORT_QUERY_PARAM,
    WORKBENCH_STATUS_QUERY_PARAM,
    WORKBENCH_VIEW_QUERY_PARAM,
} from './config';
import { replaceWorkbenchUrl } from './router';
import { escapeHtml } from './ui/format';
import { icon } from './ui/icons';

export type WorkbenchView = 'board' | 'list';

export interface WorkbenchState {
    view: WorkbenchView;
    q: string;
    status: string;
    filter: string;
    sort: string;
    direction: SortDirection;
}

export interface WorkbenchFilterOption {
    value: string;
    label: string;
}

export interface WorkbenchToolbarConfig {
    storageKey: string;
    searchPlaceholder: string;
    statuses: WorkbenchFilterOption[];
    filterParam: string;
    filterLabel: string;
    filterOptions: WorkbenchFilterOption[];
    defaultSort: string;
}

function readStoredView(storageKey: string): WorkbenchView {
    try {
        return window.localStorage.getItem(storageKey) === 'list' ? 'list' : 'board';
    } catch (_err) {
        return 'board';
    }
}

function storeView(storageKey: string, view: WorkbenchView): void {
    try {
        window.localStorage.setItem(storageKey, view);
    } catch (_err) {
        // The current render still switches views when storage is unavailable.
    }
}

export function readWorkbenchState(config: WorkbenchToolbarConfig): WorkbenchState {
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get(WORKBENCH_VIEW_QUERY_PARAM);
    return {
        view:
            urlView === 'list' || urlView === 'board' ? urlView : readStoredView(config.storageKey),
        q: params.get(WORKBENCH_SEARCH_QUERY_PARAM) || '',
        status: params.get(WORKBENCH_STATUS_QUERY_PARAM) || '',
        filter: params.get(config.filterParam) || '',
        sort: params.get(WORKBENCH_SORT_QUERY_PARAM) || config.defaultSort,
        direction: params.get(WORKBENCH_DIRECTION_QUERY_PARAM) === 'asc' ? 'asc' : 'desc',
    };
}

function optionMarkup(options: WorkbenchFilterOption[], selected: string): string {
    return options
        .map(
            (option) =>
                `<option value="${escapeHtml(option.value)}" ${option.value === selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`,
        )
        .join('');
}

export function renderWorkbenchToolbar(
    config: WorkbenchToolbarConfig,
    state: WorkbenchState,
): string {
    return `
      <div class="workbench-toolbar" aria-label="Search and view controls">
        <label class="workbench-search input input-sm">
          ${icon('search', 'size-4 opacity-55')}
          <input id="workbench-search" type="search" value="${escapeHtml(state.q)}" placeholder="${escapeHtml(config.searchPlaceholder)}" autocomplete="off" />
        </label>
        <label class="sr-only" for="workbench-status">Status</label>
        <select id="workbench-status" class="select select-sm" aria-label="Filter by status">
          <option value="">All statuses</option>
          ${optionMarkup(config.statuses, state.status)}
        </select>
        <label class="sr-only" for="workbench-filter">${escapeHtml(config.filterLabel)}</label>
        <select id="workbench-filter" class="select select-sm" aria-label="Filter by ${escapeHtml(config.filterLabel)}">
          <option value="">All ${escapeHtml(config.filterLabel.toLocaleLowerCase())}</option>
          ${optionMarkup(config.filterOptions, state.filter)}
        </select>
        <div class="join workbench-view-toggle" role="group" aria-label="View">
          <button type="button" class="btn btn-sm join-item ${state.view === 'board' ? 'btn-active' : ''}" data-workbench-view="board" aria-pressed="${state.view === 'board'}">
            ${icon('columns', 'size-4')} <span>Board</span>
          </button>
          <button type="button" class="btn btn-sm join-item ${state.view === 'list' ? 'btn-active' : ''}" data-workbench-view="list" aria-pressed="${state.view === 'list'}">
            ${icon('list', 'size-4')} <span>List</span>
          </button>
        </div>
        <div id="workbench-filter-chips" class="workbench-filter-chips"></div>
      </div>`;
}

function labelFor(options: WorkbenchFilterOption[], value: string): string {
    if (value.includes(',')) {
        return value
            .split(',')
            .map((part) => options.find((option) => option.value === part)?.label || part)
            .join(' + ');
    }
    return options.find((option) => option.value === value)?.label || value;
}

function renderChips(config: WorkbenchToolbarConfig, state: WorkbenchState): void {
    const host = document.getElementById('workbench-filter-chips');
    if (!host) return;
    const chips: string[] = [];
    if (state.q)
        chips.push(
            `<button type="button" class="filter-chip" data-clear-filter="q">Search: ${escapeHtml(state.q)} ×</button>`,
        );
    if (state.status) {
        chips.push(
            `<button type="button" class="filter-chip" data-clear-filter="status">${escapeHtml(labelFor(config.statuses, state.status))} ×</button>`,
        );
    }
    if (state.filter) {
        chips.push(
            `<button type="button" class="filter-chip" data-clear-filter="specific">${escapeHtml(labelFor(config.filterOptions, state.filter))} ×</button>`,
        );
    }
    if (chips.length > 1) {
        chips.push(
            '<button type="button" class="filter-clear" data-clear-filter="all">Clear all</button>',
        );
    }
    host.innerHTML = chips.join('');
}

function updateUrl(config: WorkbenchToolbarConfig, state: WorkbenchState): void {
    const url = new URL(window.location.href);
    const setOrDelete = (key: string, value: string) => {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
    };
    setOrDelete(WORKBENCH_VIEW_QUERY_PARAM, state.view);
    setOrDelete(WORKBENCH_SEARCH_QUERY_PARAM, state.q);
    setOrDelete(WORKBENCH_STATUS_QUERY_PARAM, state.status);
    setOrDelete(config.filterParam, state.filter);
    setOrDelete(WORKBENCH_SORT_QUERY_PARAM, state.sort === config.defaultSort ? '' : state.sort);
    setOrDelete(WORKBENCH_DIRECTION_QUERY_PARAM, state.direction === 'desc' ? '' : state.direction);
    replaceWorkbenchUrl(url);
}

export function wireWorkbenchToolbar(
    config: WorkbenchToolbarConfig,
    state: WorkbenchState,
    onChange: (state: WorkbenchState) => void,
): void {
    let searchTimer = 0;
    const emit = () => {
        updateUrl(config, state);
        renderChips(config, state);
        onChange({ ...state });
    };
    const search = document.getElementById('workbench-search') as HTMLInputElement;
    search.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
            state.q = search.value.trim();
            emit();
        }, 250);
    });
    (document.getElementById('workbench-status') as HTMLSelectElement).addEventListener(
        'change',
        (event) => {
            state.status = (event.target as HTMLSelectElement).value;
            emit();
        },
    );
    (document.getElementById('workbench-filter') as HTMLSelectElement).addEventListener(
        'change',
        (event) => {
            state.filter = (event.target as HTMLSelectElement).value;
            emit();
        },
    );
    document.querySelectorAll<HTMLButtonElement>('[data-workbench-view]').forEach((button) => {
        button.addEventListener('click', () => {
            state.view = button.dataset.workbenchView as WorkbenchView;
            storeView(config.storageKey, state.view);
            document
                .querySelectorAll<HTMLButtonElement>('[data-workbench-view]')
                .forEach((item) => {
                    const selected = item.dataset.workbenchView === state.view;
                    item.classList.toggle('btn-active', selected);
                    item.setAttribute('aria-pressed', String(selected));
                });
            emit();
        });
    });
    document.getElementById('workbench-filter-chips')?.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
            '[data-clear-filter]',
        );
        if (!button) return;
        const target = button.dataset.clearFilter;
        if (target === 'q' || target === 'all') {
            state.q = '';
            search.value = '';
        }
        if (target === 'status' || target === 'all') {
            state.status = '';
            (document.getElementById('workbench-status') as HTMLSelectElement).value = '';
        }
        if (target === 'specific' || target === 'all') {
            state.filter = '';
            (document.getElementById('workbench-filter') as HTMLSelectElement).value = '';
        }
        emit();
    });
    renderChips(config, state);
}

export function wireSortableHeaders(
    state: WorkbenchState,
    onChange: (state: WorkbenchState) => void,
): void {
    document.querySelectorAll<HTMLButtonElement>('[data-workbench-sort]').forEach((button) => {
        button.addEventListener('click', () => {
            const sort = button.dataset.workbenchSort!;
            state.direction = state.sort === sort && state.direction === 'asc' ? 'desc' : 'asc';
            state.sort = sort;
            const url = new URL(window.location.href);
            url.searchParams.set(WORKBENCH_SORT_QUERY_PARAM, state.sort);
            url.searchParams.set(WORKBENCH_DIRECTION_QUERY_PARAM, state.direction);
            replaceWorkbenchUrl(url);
            onChange({ ...state });
        });
    });
}

export function workItemHref(param: string, id: string): string {
    const url = new URL(window.location.href);
    [INVENTORY_REQUEST_QUERY_PARAM, PROGRAM_REQUEST_QUERY_PARAM, TICKET_QUERY_PARAM].forEach(
        (key) => url.searchParams.delete(key),
    );
    url.searchParams.delete(WORKBENCH_MODE_QUERY_PARAM);
    url.searchParams.set(param, id);
    return url.pathname + url.search + url.hash;
}
