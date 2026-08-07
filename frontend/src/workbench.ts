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

export interface WorkbenchState {
    q: string;
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
    filterParam?: string;
    filterLabel?: string;
    filterOptions?: WorkbenchFilterOption[];
    defaultSort: string;
    defaultDirection?: SortDirection;
}

export function readWorkbenchState(config: WorkbenchToolbarConfig): WorkbenchState {
    void config.storageKey;
    const params = new URLSearchParams(window.location.search);
    return {
        q: params.get(WORKBENCH_SEARCH_QUERY_PARAM) || '',
        filter: config.filterParam ? params.get(config.filterParam) || '' : '',
        sort: params.get(WORKBENCH_SORT_QUERY_PARAM) || config.defaultSort,
        direction:
            params.get(WORKBENCH_DIRECTION_QUERY_PARAM) === 'asc'
                ? 'asc'
                : config.defaultDirection || 'desc',
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
    const specificFilter =
        config.filterParam && config.filterLabel && config.filterOptions
            ? `
        <label class="sr-only">${escapeHtml(config.filterLabel)}</label>
        <select data-workbench-filter class="select select-sm" aria-label="Filter by ${escapeHtml(config.filterLabel)}">
          <option value="">All ${escapeHtml(config.filterLabel.toLocaleLowerCase())}</option>
          ${optionMarkup(config.filterOptions, state.filter)}
        </select>`
            : '';
    return `
      <div class="workbench-toolbar" aria-label="Search and view controls">
        <label class="workbench-search input input-sm">
          ${icon('search', 'size-4 opacity-55')}
          <input id="workbench-search" type="search" value="${escapeHtml(state.q)}" placeholder="${escapeHtml(config.searchPlaceholder)}" autocomplete="off" />
        </label>
        ${specificFilter}
        <div id="workbench-filter-chips" class="workbench-filter-chips"></div>
      </div>`;
}

function labelFor(options: WorkbenchFilterOption[], value: string): string {
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
    if (state.filter) {
        chips.push(
            `<button type="button" class="filter-chip" data-clear-filter="specific">${escapeHtml(labelFor(config.filterOptions || [], state.filter))} ×</button>`,
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
    url.searchParams.delete(WORKBENCH_VIEW_QUERY_PARAM);
    url.searchParams.delete(WORKBENCH_STATUS_QUERY_PARAM);
    setOrDelete(WORKBENCH_SEARCH_QUERY_PARAM, state.q);
    if (config.filterParam) setOrDelete(config.filterParam, state.filter);
    setOrDelete(WORKBENCH_SORT_QUERY_PARAM, state.sort === config.defaultSort ? '' : state.sort);
    setOrDelete(
        WORKBENCH_DIRECTION_QUERY_PARAM,
        state.direction === (config.defaultDirection || 'desc') ? '' : state.direction,
    );
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
    const filter = document.querySelector<HTMLSelectElement>('[data-workbench-filter]');
    filter?.addEventListener('change', (event) => {
        state.filter = (event.target as HTMLSelectElement).value;
        emit();
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
        if (target === 'specific' || target === 'all') {
            state.filter = '';
            if (filter) filter.value = '';
        }
        emit();
    });
    renderChips(config, state);
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
