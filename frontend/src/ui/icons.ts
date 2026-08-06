// Small hand-authored line-icon set (no external icon font or CDN, keeping
// the build free of runtime dependencies). Every icon shares the same
// stroke weight and cap style so they read as one system.

export type IconName =
    | 'home'
    | 'calendar'
    | 'box'
    | 'clapper'
    | 'ticket'
    | 'user'
    | 'shield'
    | 'plus'
    | 'external'
    | 'inbox'
    | 'alert'
    | 'list'
    | 'columns'
    | 'chevronDown'
    | 'chevronLeft'
    | 'chevronRight'
    | 'pin'
    | 'edit'
    | 'trash'
    | 'search'
    | 'mail'
    | 'message';

const ICON_PATHS: Record<IconName, string> = {
    home: '<path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />',
    calendar:
        '<rect x="4" y="5" width="16" height="15" rx="2" /><line x1="4" y1="9" x2="20" y2="9" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />',
    box: '<path d="M3.5 8 12 4l8.5 4L12 12 3.5 8Z" /><path d="M3.5 8v8L12 20l8.5-4V8" /><path d="M12 12v8" />',
    clapper:
        '<path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" /><path d="M4 9 5 5h3l-1 4Z" /><path d="M9.5 9 10.5 5h3l-1 4Z" /><path d="M15 9l1-4h3l-1 4Z" />',
    ticket: '<rect x="3" y="6" width="18" height="12" rx="2" /><line x1="9" y1="6" x2="9" y2="18" stroke-dasharray="2.2 2.2" />',
    user: '<circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3.2-6 7-6s7 2.5 7 6" />',
    shield: '<path d="M12 3.5 5 6v5.5c0 5 3 8 7 9 4-1 7-4 7-9V6l-7-2.5Z" /><path d="M9 12l2 2 4-4" />',
    plus: '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />',
    external:
        '<path d="M14 4h6v6" /><line x1="20" y1="4" x2="10" y2="14" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />',
    inbox: '<path d="M4 12h4l2 3h4l2-3h4" /><path d="M4 12 6 5h12l2 7" /><path d="M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />',
    alert: '<path d="M12 4 3 20h18L12 4Z" /><line x1="12" y1="10" x2="12" y2="13.5" /><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" />',
    list: '<line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />',
    columns:
        '<rect x="3.5" y="4" width="7" height="16" rx="1.5" /><rect x="13.5" y="4" width="7" height="16" rx="1.5" /><line x1="6" y1="8" x2="8" y2="8" /><line x1="16" y1="8" x2="18" y2="8" />',
    chevronDown: '<polyline points="6 9 12 15 18 9" />',
    chevronLeft: '<polyline points="15 6 9 12 15 18" />',
    chevronRight: '<polyline points="9 6 15 12 9 18" />',
    pin: '<path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.3" />',
    edit: '<path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" /><line x1="13.5" y1="6.5" x2="17.5" y2="10.5" />',
    trash: '<path d="M5 7h14" /><path d="M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />',
    search: '<circle cx="11" cy="11" r="6.5" /><line x1="16" y1="16" x2="21" y2="21" />',
    mail: '<rect x="4" y="6" width="16" height="12" rx="2" /><path d="m5 8 7 5 7-5" />',
    message:
        '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16H9l-4.5 4v-4H5A1.5 1.5 0 0 1 3.5 14.5v-8A1.5 1.5 0 0 1 5 5Z" />',
};

export function icon(name: IconName, className = 'size-5'): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}
